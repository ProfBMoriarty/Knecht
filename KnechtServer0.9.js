(function()
{
    "use strict";

    //region Server Configuration Variables
    var port = 8080; //Port the server will be listening on
    var access_whitelist = '*'; //domains allowed to send requests to this server
    var db_config =
    { //authentication variables and column lengths for the mysql server
        host: 'localhost',
        user: 'root',
        password:'pass',
        reconnect_delay: 2000,
        column_length: //Note: column length variables only apply if tables do not already exist in the database
        {
            username: 255,
            password: 32,
            session_id: 320,
            application: 64,
            field: 128,
            group: 64,
            data: 0xFFFFFF,
            input: 0xFFFFFF
        }
    };
    var err_msg =
    {
        request_err: {error: 'Unsupported Request'},//the request received is not supported by this server
        db_err: {error: 'Database Error'}, //an error has occurred during a query to the MYSQL database
        incorrect_args: {error: 'Incorrect Argument'}, //one or more arguments to the requested function is incorrect
        invalid_session: {error:'Invalid Session ID'}, //the provided session token does not match the one stored
        expired_session: {error: 'Expired Session ID'}, //the provided session token matches but has expired
        no_user: {error: 'User Doesn\'t Exist'}, //the provided user does not exist in the database
        no_group: {error: 'Group Doesn\'t Exist'}, //the provided group does not exist in the database
        not_host: {error: 'User Is Not Host'}, //the provided user is not the host of the provided group
        dup_user: {error: 'User Already Exists'}, //the provided user already exists in the database
        dup_group: {error: 'Group Already Exists'}, //the provided group already exists in the database
        dup_member: {error: 'User Already Member'}, //the provided user is already a member of the provided group
        not_member: {error: 'User Is Not Member'}, //the provided user is not a member of the provided group
        wrong_pass: {error: 'Incorrect Password'} //the provided password is incorrect for the provided user or group
    };
    //endregion

    //region Global Variables
    var mysql = require('mysql'); //Node.js module for interacting with the mysql database
    var url = require('url'); //Node.js module for parsing request urls
    var http = require('http'); //Node.js module for handling http requests

    var connection; //object representing the open connection to the mysql database

    //members are group names with object values, whose members are user names with pending response values
    var hooks = {};
    //members are group names with object values, whose members are user names with number values that are size limits
    //for data to be retrieved on update
    var update_size_limits = {};

    //endregion

    //region Initialization Functions
    function _connect() //recommended disconnect handler from https://github.com/felix/node-mysql/blob/master/Readme.md
    {
        connection = mysql.createConnection(db_config);
        connection.connect(function(err)
        { //open connection to the mysql database
            if(err)
            { //if connecting fails, try again after delay
                window.setTimeout(_connect, db_config.reconnect_delay);
            }
        });
        connection.on('error', function(err)
        { //reconnect automatically if disconnected, or throw error if other db error
            if(err.code === 'PROTOCOL_CONNECTION_LOST')
            {
                _connect();
            }
            else
            {
                throw err;
            }
        });
    }
    //initialize the database
    function _initDatabase()
    { //create necessary database tables if they do not yet exist
        function _checkInitError(err)
        {//helper function to simply cut down on repeated code. Throws exception if error occurs during initialization
            if(err)
            {
                throw err;
            }
        }
        //create the knecht database, where all tables will be stored
        connection.query('CREATE DATABASE IF NOT EXISTS knecht;', function(create_db_err)
        {
            _checkInitError(create_db_err);
            //set knecht as the active database
            connection.query('USE knecht;', function(use_knecht_err)
            {
                _checkInitError(use_knecht_err);
                //create table containing user IDs and authentication variables
                connection.query('CREATE TABLE IF NOT EXISTS users(' + //each entry represents a single knecht account
                    //name of the account
                    'username VARCHAR (' + db_config.column_length.username + '),' +
                    //password associated with account
                    'password VARCHAR (' + db_config.column_length.password + '),' +
                    //maximum time in minutes between requests before account's session expires
                    'timeout TINYINT,' +
                    //username + number generated randomly on login that identifies the active session for this account
                    'session_id VARCHAR (' + db_config.column_length.session_id + '),' +
                    //timestamp of the last request received from this account
                    'last_ping BIGINT,' +
                    //username must be unique among all entries
                    'PRIMARY KEY (username));',
                    function(create_users_err)
                    {
                        _checkInitError(create_users_err);
                        //create table of single-player application data entries
                        connection.query('CREATE TABLE IF NOT EXISTS user_data(' +
                            //the name of the account with which the entry is associated
                            'user VARCHAR (' + db_config.column_length.username + '),' +
                            //the application with which the entry is associated
                            'app VARCHAR (' + db_config.column_length.application + '),' +
                            //the name of the data field with which the entry is associated
                            'field VARCHAR (' + db_config.column_length.field + '),' +
                            //data value stored in the specified field
                            'data TEXT (' + db_config.column_length.data + '),' +
                            //combination of user, app, and field must be unique among all entries
                            'PRIMARY KEY (user, app, field),' +
                            //user field must correspond to a registered user
                            'FOREIGN KEY (user) REFERENCES users (username)' +
                            //entries will be deleted or updated as the associated user is deleted or renamed
                            'ON DELETE CASCADE ON UPDATE CASCADE);',
                            _checkInitError);
                        connection.query('CREATE TABLE IF NOT EXISTS groups(' +
                            //the name of the group with which the entry is associated
                            'name VARCHAR (' + db_config.column_length.group + '),' +
                            //the name off the application the group is for
                            'app VARCHAR (' + db_config.column_length.application + '),' +
                            //the name of the account that started the group
                            'host VARCHAR (' + db_config.column_length.username + '),' +
                            //group name must be unique among all entries
                            'PRIMARY KEY (name),' +
                            //host field must correspond to a registered user
                            'FOREIGN KEY (host) REFERENCES users (username)' +
                            //entries will be deleted or updated as the host user is deleted or renamed
                            'ON DELETE CASCADE ON UPDATE CASCADE);',
                            function(create_groups_err)
                            {
                                _checkInitError(create_groups_err);
                                //create table of group member entries
                                connection.query('CREATE TABLE IF NOT EXISTS members(' +
                                    //name of the group the entry is associated with
                                    'group_name VARCHAR (' + db_config.column_length.group + '),' +
                                    //name of the user the entry is associated with
                                    'user VARCHAR (' + db_config.column_length.username + '),' +
                                    //combination of group name and username must be unique among all entries
                                    'PRIMARY KEY (group_name, user),' +
                                    //user field must correspond to a registered user
                                    'FOREIGN KEY (user) REFERENCES users (username)' +
                                    //entries will be deleted or updated as the associated user is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE,' +
                                    //group_name field must correspond to a registered group
                                    'FOREIGN KEY (group_name) REFERENCES groups (name)' +
                                    //entries will be deleted or updated as the associated group is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE);',
                                    _checkInitError);
                                //create table of shared data entries
                                connection.query('CREATE TABLE IF NOT EXISTS group_data(' +
                                    //name of the group the entry is associated with
                                    'group_name VARCHAR (' + db_config.column_length.group + '),' +
                                    //name of the data field the entry is associated with
                                    'field VARCHAR (' + db_config.column_length.field + '),' +
                                    //data value stored in the specified field
                                    'data TEXT (' + db_config.column_length.data + '),' +
                                    //combination of group_name and field must be unique among all entries
                                    'PRIMARY KEY (group_name, field),' +
                                    //group_name must correspond to a registered group
                                    'FOREIGN KEY (group_name) REFERENCES groups(name)' +
                                    //entries will be deleted or updated as the associated group is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE);',
                                    _checkInitError);
                                //create table of pending update notifications
                                connection.query('CREATE TABLE IF NOT EXISTS updates(' +
                                    //name of the group the notification is for
                                    'group_name VARCHAR (' + db_config.column_length.group + '),' +
                                    //name of the user the notification is for
                                    'user VARCHAR (' + db_config.column_length.username + '),' +
                                    //name of the data field that has been updated
                                    'field VARCHAR (' + db_config.column_length.field + '),' +
                                    //timestamp off when the update occurred
                                    'time BIGINT,' +
                                    //random number to distinguish this update from others for garbage cleaning
                                    'id VARCHAR (' + db_config.column_length.session_id + '),' +
                                    //combination of group_name, user, and field must be unique among all entries
                                    'PRIMARY KEY (group_name, user, field),' +
                                    //user must correspond to a registered user
                                    'FOREIGN KEY (user) REFERENCES users (username)' +
                                    //entries will be deleted or updated as the associated user is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE,' +
                                    //group_name must correspond to a registered group
                                    'FOREIGN KEY (group_name) REFERENCES groups(name)' +
                                    //entries will be deleted or updated as the associated group is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE);',
                                    _checkInitError);
                                //create table of pending inputs
                                connection.query('CREATE TABLE IF NOT EXISTS inputs(' +
                                    //name of the group the input is for
                                    'group_name VARCHAR (' + db_config.column_length.group + '),' +
                                    //name of the user the input is from
                                    'user VARCHAR (' + db_config.column_length.username + '),' +
                                    //input value associated with the entry
                                    'input TEXT (' + db_config.column_length.input + '),' +
                                    //timestamp of when the input was received by the server
                                    'time BIGINT,' +
                                    //random number to distinguish this input from others for garbage cleaning
                                    'id VARCHAR (' + db_config.column_length.session_id + '),' +
                                    //user must correspond to a registered user
                                    'FOREIGN KEY (user) REFERENCES users (username)' +
                                    //entries will be deleted or updated as the associated user is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE,' +
                                    //user must correspond to a registered group
                                    'FOREIGN KEY (group_name) REFERENCES groups(name)' +
                                    //entries will be deleted or updated as the associated group is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE);',
                                    _checkInitError);
                                //create table of entries defining a whitelist of who can access group data fields
                                connection.query('CREATE TABLE IF NOT EXISTS permissions(' +
                                    //name of the group the permission is for
                                    'group_name VARCHAR (' + db_config.column_length.group + '),' +
                                    //name of the user granted permissions. If this field is host, all users can access
                                    'user VARCHAR (' + db_config.column_length.username + '),' +
                                    //field the permission is for
                                    'field VARCHAR (' + db_config.column_length.field + '),' +
                                    //combination of group_name, user, and field must be unique among all entries
                                    'PRIMARY KEY (group_name, user, field),' +
                                    //user must correspond to a registered user
                                    'FOREIGN KEY (user) REFERENCES users (username)' +
                                    //entries will be deleted or updated as the associated user is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE,' +
                                    //user must correspond to a registered group
                                    'FOREIGN KEY (group_name) REFERENCES groups (name)' +
                                    //entries will be deleted or updated as the associated group is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE);',
                                    _checkInitError);
                            });
                    });
            });
        });
    }
    //endregion

    //region Response Functions

    /** This function constructs a well formatted response for ajax and returns it to the requesting client.
     * @param status is an integer that is a standard HTTP response code indicated the success or failure of the request
     * @param response is the http request that is waiting for the response from the server.
     * @param body this is an object that is the server's response to the query that this function is answering
     */
    function _finishResponse(status, response, body)
    {//applies headers to an http response and sends it to the client
        if(!body)
        { //if no body object provided, create an empty object
            body = {};
        }
        body.timestamp = new Date().getTime(); //number of milliseconds since midnight January 1, 1970
        response.writeHead(status,
            {
                'Content-Type': 'application/json', //tell browser that the response boy will be in JSON string format
                'Access-Control-Allow-Origin': access_whitelist, //allow whitelisted domains to make requests
                'Cache-Control': 'no-cache, no-store, must-revalidate', //disallow caching of requests
                'Pragma': 'no-cache', //disallow caching of requests
                'Expires': 0 //disallow caching of requests
            });
        response.end(JSON.stringify(body)); //send the finished response back to client as JSON
        console.log(JSON.stringify(body));
    }

    /** This function returns a list of valid requests.
     * @param methods is a string that lists the valid http requests that can be made to this uri
     * @param response is the http request that is waiting for the response from the server
     */
    function _respondOptions(methods, response)
    { //sends an OPTIONS response to the client listing allowed methods on the requested resource
        response.writeHead(200,
            {
                'Access-Control-Allow-Origin': access_whitelist, //allow whitelisted domains to make requests
                'Access-Control-Allow-Methods': methods //list the methods that can be requested on this resource
            });
        response.end(); //send the finished response back to client
    }
    //endregion

    //region Utility Functions
    function _isJSON (string)
    { //returns true if the given string can be parsed as JSON, otherwise false
        try
        {
            JSON.parse(string);
        }
        catch (e)
        {
            return false;
        }
        return true;
    }

    function _generateSessionID(username)
    {//returns a session_id token for the given username
        return username + Math.random();
    }
    //endregion

    //region Credentials Functions

    /** This function responds with an error if the provided session is invalid or expired, otherwise executes callback
     * with the name of the associated user as its sole parameter
     * @param session is a string that is the session key of an active session
     * @param response is the http response object that is waiting for the response of this request
     * @param callback is the server side function that needs the credentials verified before it can execute
     */
    function _checkCredentials(session, response, callback)
    {
        connection.query(
            "SELECT username, timeout, last_ping " +
                "FROM users " +
                "WHERE session_id = ? " +
                "LIMIT 1;",
            [session],
            function(err, result)
            {
                if(err)
                { //database error
                    _finishResponse(500, response, err_msg.db_err);
                }
                else if(result.length === 0)
                {//no user found matching provided session id
                    _finishResponse(404, response, err_msg.invalid_session);
                }
                else if(result[0].last_ping + result[0].timeout * 60000 <= new Date().getTime() )
                {//session_id expired
                    _finishResponse(401, response, err_msg.expired_session);
                }
                else
                {//refresh the expiration countdown on this session
                    connection.query(
                        "UPDATE users " +
                            "SET last_ping = ? " +
                            "WHERE username = ? " +
                            "LIMIT 1;",
                        [new Date().getTime(), result[0].username],
                        function(err)
                        {
                            if(err)
                            {//database error
                                _finishResponse(500, response, err_msg.db_err);
                            }
                            else
                            { //pass username to callback
                                callback(result[0].username);
                            }
                        });
                }
            });
    }

    /** This function responds with an error if the provided group does not exist or if it is not hosted by the provided
     *  user, otherwise executes callback with no parameters
     * @param username is a string that is a username, hopefully the username of the host of the group
     * @param group is a string that is the name of the that username is supposedly the host of
     * @param response is the http response object that is waiting for the response of this request
     * @param callback is the function that will be executed if the host is valid
     */
    function _checkHost(username, group, response, callback)
    {
        connection.query(
            "SELECT host " +
                "FROM groups " +
                "WHERE name = ? " +
                "LIMIT 1;",
            [group],
            function(err, result)
            {
                if(err)
                {//database error
                    _finishResponse(500, response, err_msg.db_err);
                }
                else if (result.length === 0)
                {//group not found
                    _finishResponse(404, response, err_msg.no_group);
                }
                else if(result[0].host !== username)
                {//user is not host
                    _finishResponse(403, response, err_msg.not_host);
                }
                else
                {//proceed to callback
                    callback();
                }
            });
    }
    //endregion

    //region User functions

    /** this function returns a boolean to the client that is true if the given member is registered, else false
     * @param username is a string that is the username to be checked for use
     * @param response is the http response object that is waiting for the response of this request
     */
    function _checkUserRegistered(username, response)
    {
        if( typeof username !== 'string' )
        { //argument is of incorrect type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        connection.query(
            "SELECT 1 " +
                "FROM users " +
                "WHERE username = ? " +
                "LIMIT 1;",
            [username],
            function(err, result)
            {
                if(err)
                {//database error
                    _finishResponse(500, response, err_msg.db_err);
                }
                else if (result.length === 0)
                {//user is not registered
                    _finishResponse(200, response, {registered: false});
                }
                else
                {//user is registered
                    _finishResponse(200, response, {registered: true});
                }
            });
    }

    /** This functions adds a new account to the database.
     * @param username is a string that is the username and possible email address of the new account.
     * @param password is a string that is the password of the new account.
     * @param timeout is a string that names an integer ex. '15' or '60'.  It is the number of minutes this account waits
     * before expiring session keys.
     * @param response is the http response object that is waiting for the response of this request
     */

    function _register(username, password, timeout, response)
    {//responds with member session of type string if successful. value is initial session_id
        if(!_isJSON(password))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        password = JSON.parse(password);
        timeout = parseInt(timeout, 10);
        if(typeof username !== 'string' || typeof password !== 'string' || isNaN(timeout) )
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        var session_id = _generateSessionID(username);
        connection.query(
            "INSERT INTO users " +
                "VALUES (?, ?, ?, ?, ?);",
            [username, password, timeout, session_id, new Date().getTime()],
            function(err)
            {
                if(err)
                {//if user already exists, respond with duplicate user error message, otherwise database error message
                    if(err.code === "ER_DUP_ENTRY")
                    {
                        _finishResponse(403, response,  err_msg.dup_user);
                    }
                    else
                    {
                        _finishResponse(500, response, err_msg.db_err);
                    }
                }
                else
                { //respond with the session id if successful
                    _finishResponse(200, response, {session: session_id});
                } //user registered and logged in successfully
            });
    }

    /** Removes the given account from the database.
     * @param session_id is a string that identifies which currently logged in account is to be deleted.
     * @param response is the http response object that is waiting for the response of this request
     */

    function _unregister(session_id, response)
    {//removes user and all associated db entries if successful
        if(typeof session_id !== 'string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            //get all of the groups this user is host of
            connection.query(
                "SELECT name " +
                    "FROM groups " +
                    "WHERE host = ?;",
                [username],
                function(err, result)
                {
                    if(err)
                    {//database error
                        _finishResponse(500, response, err_msg.db_err);
                    }
                    else
                    {//remove the user from the database
                        connection.query(
                            "DELETE FROM users " +
                                "WHERE username = ? " +
                                "LIMIT 1;",
                            [username],
                            function(err)
                            {
                                if(err)
                                {//database error
                                    _finishResponse(500, response, err_msg.db_err);
                                }
                                else
                                {
                                    var i, group, member;
                                    _finishResponse(200, response); //user successfully removed from database
                                    for(i = 0; i < result.length; i += 1)
                                    {//notify hosted group members that group no longer exists
                                        for(member in hooks[result[i].name])
                                        {
                                            if (hooks[result[i].name].hasOwnProperty(member))
                                            {
                                                _finishResponse(200, hooks[result[i].name][member]);
                                            }
                                        }
                                        delete hooks[result[i].name];
                                    }
                                    for(member in hooks)
                                    {
                                        if (hooks.hasOwnProperty(member))
                                        {//delete this user's stored hooks
                                            delete hooks[member][username];
                                        }
                                    }
                                }
                            });
                    }
                });
        });
    }
    //endregion

    //region User Session functions

    //responds with member session of type string if successful, with session_id as value. Invalidates previous session
    /** This function creates a new session key for the account with the given username and password.
     * @param username is a string that is the username of the account to log in.
     * @param password is a string that is the password of the account to log in.
     * @param response is the http response object that is waiting for the response of this request
     */
    function _login(username, password, response)
    {
        if(typeof username !== 'string' || !_isJSON(password))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        password = JSON.parse(password);
        if(typeof password !== 'string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        connection.query(
            "SELECT password " +
                "FROM users " +
                "WHERE username = ? " +
                "LIMIT 1;",
            [username],
            function(err, result)
            {
                if(err)
                {//database error
                    _finishResponse(500, response, err_msg.db_err);
                }
                else if(result.length === 0)
                {//user not found
                    _finishResponse(404, response, err_msg.no_user);
                }
                else if(result[0].password !== password)
                {//incorrect password
                    _finishResponse(401, response, err_msg.wrong_pass);
                }
                else
                {
                    var session_id = _generateSessionID(username);
                    connection.query(
                        "UPDATE users " +
                            "SET session_id = ?, last_ping = ? " +
                            "WHERE username = ? " +
                            "LIMIT 1;",
                        [session_id, new Date().getTime(), username],
                        function(err)
                        {
                            if(err)
                            {//database error
                                _finishResponse(500, response, err_msg.db_err);
                            }
                            else
                            {//login successful
                                _finishResponse(200, response, {session: session_id});
                            }
                        });
                }
            });
    }

    /** This function expires the given session_id if it is valid.
     * @param session_id is a string that is the session id to be expired.
     * @param response is the http response object that is waiting for the response of this request
     */
    function _logout(session_id, response)
    {//expires session_id if successful
        if(typeof session_id !== 'string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            //set last ping to epoch to expire session
            connection.query(
                "UPDATE users " +
                    "SET last_ping = 0 " +
                    "WHERE username = ? " +
                    "LIMIT 1;",
                [username],
                function(err)
                {
                    if(err)
                    {//database error
                        _finishResponse(500, response, err_msg.db_err);
                    }
                    else
                    {
                        _finishResponse(200, response);
                    } //logout successful
                });
        });
    }
    //endregion

    //region User Password functions

    /** This function will send an email with the user's password to their email address, if it ever gets implemented.
     * @param username is a string that is a username of a registered account and also a valid email address.
     * @param response is the http response object that is waiting for the response of this request.
     */

    function _recoverPassword(username, response)
    {//treats username as an email address to send password details to
        if(typeof username !== 'string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        connection.query(
            "SELECT 1 " +
                "FROM users " +
                "WHERE username = ?;",
            [username],
            function(err, result)
            {
                if(err)
                {//database error
                    _finishResponse(500, response, err_msg.db_err);
                }
                else if(result === 0)
                {//user not found
                    _finishResponse(404, response, err_msg.no_user);
                }
                else
                {
                    //TODO: send recovery email
                    _finishResponse(200, response);//no guarantee that email is actually received, only that it is sent
                }
            });
    }

    /** This function alters the password of account associated with the given session id.
     * @param session_id is a string that is the session id of the account, the password of which is to be changed.
     * @param password is a string that is the account's new password.
     * @param response is the http response object that is waiting for the response of this request.
     */

    function _changePassword(session_id, password, response)
    {
        if(typeof session_id !== 'string' || !_isJSON(password))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        password = JSON.parse(password);
        if(typeof password !== 'string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            connection.query(
                "UPDATE users " +
                    "SET password = ? " +
                    "WHERE username = ? " +
                    "LIMIT 1;",
                [password, username],
                function(err)
                {
                    if(err)
                    {//database error
                        _finishResponse(500, response, err_msg.db_err);
                    }
                    else
                    {
                        _finishResponse(200, response);
                    }
                });
        });
    }
    //endregion

    //region User Data functions

    function _putData(session_id, app, field, data, response)
    {//data and field are both either strings or arrays of strings with the same number of elements
        if(typeof session_id !== 'string' || typeof app !== 'string' || !_isJSON(field) || !_isJSON(data))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        field = JSON.parse(field);
        data = JSON.parse(data);
        if(typeof field === 'string')
        {//massage single strings into arrays so they can be processed
            field = [field];
            data = [data];
        }
        else if(!(field instanceof Array) || !(data instanceof Array) || field.length !== data.length)
        {//argument is of wrong type, or array lengths do not match
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            var i, values;
            values = ''; //entry values to be inserted into user_data table
            for(i = 0; i < field.length; i += 1)
            { //for each field to be updated, add an entry to the values string
                if(typeof field[i] !== 'string')
                {//argument is of wrong type
                    _finishResponse(400, response, err_msg.incorrect_args);
                    return;
                }
                values += "("
                    + connection.escape(username) + ","
                    + connection.escape(app) + ","
                    + connection.escape(field[i]) + ","
                    + connection.escape(JSON.stringify(data[i])) + ")";
                if(i < field.length -1)
                {
                    values += ",";
                }
            }
            connection.query(
                "INSERT INTO user_data " +
                    "VALUES " + values +
                    " ON DUPLICATE KEY " +
                    "UPDATE user_data " +
                    "SET data = VALUES(data);",
                function(err)
                {
                    if(err)
                    {//database error
                        _finishResponse(500, response, err_msg.db_err);
                    }
                    else
                    {//data successfully updated
                        _finishResponse(200, response);
                    }
                });
        });
    }

    /*field can be either a single string or an array of string. Responds with member data of type object, with members
     corresponding to field names with the appropriate data as values*/
    function _getData(session_id, app, field, response)
    {
        if(typeof session_id !== 'string' || typeof app !== 'string' || !_isJSON(field))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        field = JSON.parse(field);
        if(typeof field === 'string')
        {//massage field into array so it can be processed
            field = [field];
        }
        else if(!(field instanceof Array))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            var i, query_fields;
            query_fields = '';//fields to be queried for their data values
            for(i = 0; i < field.length; i += 1){
                if(typeof field[i] !== 'string')
                {//argument is wrong type
                    _finishResponse(400, response, err_msg.incorrect_args);
                    return;
                }
                query_fields += "field = " + connection.escape(field[i]);
                if(i < field.length -1)
                {
                    query_fields += " OR ";
                }
            }
            connection.query(
                "SELECT field, data " +
                    "FROM user_data " +
                    "WHERE user = ? " +
                    "AND app = ? " +
                    "AND (" + query_fields + ");",
                [username, app],
                function(err, result)
                {
                    if(err)
                    {//database error
                        _finishResponse(500, response, err_msg.db_err);
                    }
                    else
                    {//process result into an object matching field names to their data values
                        var data = {};
                        for(i = 0; i < result.length; i += 1)
                        {//for each field that returned a result
                            data[result[i].field] = JSON.parse(result[i].data);
                        }
                        _finishResponse(200, response, {data: data});
                    }
                });
        });
    }

    function _deleteData(session_id, app, field, response)
    {//field can be either a single string or an array of string
        if(typeof session_id !== 'string' || typeof app !== 'string' || !_isJSON(field))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        field = JSON.parse(field);
        if(typeof field === 'string')
        {//massage field to be array so it can be processed
            field = [field];
        }
        else if(!(field instanceof Array))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response,function(username)
        {
            var i, query_fields;
            query_fields = '';//field names to be deleted
            for(i = 0; i < field.length; i += 1)
            {
                if(typeof field[i] !== 'string')
                {//argument is wrong type
                    _finishResponse(400, response, err_msg.incorrect_args);
                    return;
                }
                query_fields += "field = " + connection.escape(field[i]);
                if(i < field.length -1)
                {
                    query_fields += " OR ";
                }
            }
            connection.query(
                "DELETE FROM user_data " +
                    "WHERE user = ? " +
                    "AND app = ? " +
                    "AND (" + query_fields + ");",
                [username, app],
                function(err)
                {
                    if(err)
                    {//database error
                        _finishResponse(500, response, err_msg.db_err);
                    }
                    else
                    {
                        _finishResponse(200, response);
                    }
                });
        });
    }
    //endregion

    //region Groups functions
    function _startGroup(session_id, name, app, password, response)
    {//starts group and sets requesting user as host
        if(typeof session_id !== 'string' || typeof name !=='string' || typeof app !=='string' || !_isJSON(password))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        password = JSON.parse(password);
        if(typeof password !== 'string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            connection.query(
                "INSERT INTO groups " +
                    "VALUES (?, ?, ?);",
                [name, app, username],
                function(err)
                {
                    if(err)
                    {
                        if(err.code === "ER_DUP_ENTRY")
                        {//group already exists
                            _finishResponse(403, response, err_msg.dup_group);
                        }
                        else
                        {//database error
                            _finishResponse(500, response, err_msg.db_err);
                        }
                    }
                    else
                    {
                        hooks[name] = {}; //create object to hold pending responses for this group
                        update_size_limits[name] = {} //create object to hold app-specified data size limits
                        _finishResponse(200, response);
                    }
                });
        });
    }

    function _listGroupsOfApp(app, response)
    {//responds with member groups which is array of names of groups using the given app if successful
        if(typeof app !== 'string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        connection.query(
            "SELECT name " +
                "FROM groups " +
                "WHERE app = ?;", [app], function(err, result)
            {
                if(err)
                {//database error
                    _finishResponse(500, response, err_msg.db_err);
                }
                else
                {//process result into an array of group names
                    var i, group_list = [];
                    for(i = 0; i < result.length; i += 1)
                    {
                        group_list.push(result[i].name);
                    }
                    _finishResponse(200, response, {groups: group_list});
                }
            });
    }

    function _closeGroup(session_id, group, response)
    {//deletes a group and all its associated database entries
        if(typeof session_id !=='string' || typeof group !=='string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            _checkHost(username, group, response, function()
            {
                connection.query(
                    "DELETE FROM groups " +
                        "WHERE name = ? " +
                        "LIMIT 1;",
                    [group],
                    function(err)
                    {
                        if(err)
                        {//database error
                            _finishResponse(500, response, err_msg.db_err);
                        }
                        else {
                            var member;
                            _finishResponse(200, response);
                            for(member in hooks[group]){//notify group members that group is closed
                                if (hooks[group].hasOwnProperty(member))
                                {
                                    _finishResponse(200, hooks[group][member]);
                                }
                            }
                            delete hooks[group];
                        }
                    });
            });
        });
    }
    //endregion

    //region Group Members functions

    function _addMember(session_id, group, member, response)
    {
        if(typeof session_id !== 'string' || typeof group !== 'string' || typeof member !== 'string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            _checkHost(username, group, response, function(){
                if(member === username)
                {//user is host, thus already in group
                    _finishResponse(403, response, err_msg.dup_member);
                    return;
                }
                connection.query(
                    "INSERT INTO members " +
                        "VALUES (?, ?);",
                    [group, member],
                    function(err)
                    {
                        if(err)
                        {
                            if(err.code === "ER_DUP_ENTRY")
                            {//member is already in group
                                _finishResponse(403, response, err_msg.dup_member);
                            }
                            else
                            {//database error
                                _finishResponse(500, response, err_msg.db_err);
                            }
                        }
                        else
                        {
                            _finishResponse(200, response);
                        }
                    });
            });
        });
    }
    function _listMembersOfGroup(group, response)
    {//responds with member members if successful, which is array of username strings
        if(typeof group !== 'string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        connection.query(
            "SELECT host " +
                "FROM groups " +
                "WHERE name = ? " +
                "LIMIT 1;",
            [group],
            function(err, host)
            {
                if(err)
                {//database error
                    _finishResponse(500, response, err_msg.db_err);
                }
                else if(host.length === 0)
                {//group not found
                    _finishResponse(404, response, err_msg.no_group);
                }
                else
                {
                    var members = [];
                    connection.query(
                        "SELECT user " +
                            "FROM members " +
                            "WHERE group_name = ?;",
                        [group],
                        function(err, result)
                        {
                            if(err)
                            {//database error
                                _finishResponse(500, response, err_msg.db_err);
                            }
                            else
                            {//process result into array of usernames
                                var i;
                                for(i = 0; i < result.length; i += 1)
                                {
                                    members.push(result[i].user);
                                }
                                _finishResponse(200, response, {host: host[0].host, members: members});
                            }
                        });
                }
            });
    }

    function _removeMember(session_id, group, member, response)
    {//removes a user from a group and deletes their pending notifications
        if(typeof session_id !== 'string' || typeof group !== 'string' || typeof member !== 'string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            _checkHost(username, group, response, function()
            {
                if(username === member)
                {//host has quit, close group instead
                    _closeGroup(session_id, group, response);
                }
                else
                { //clear up the removed user's info in the group
                    if(hooks[group][member])
                    {
                        _finishResponse(200, hooks[group][member]);
                    }
                    connection.query(
                        "DELETE FROM members " +
                            "WHERE group_name = ? " +
                            "AND user = ? " +
                            "LIMIT 1;",
                        [group, member],
                        function(err)
                        {
                            if(err)
                            {//database error
                                _finishResponse(500, response, err_msg.db_err);
                            }
                            else
                            {//clean up update notifications
                                connection.query(
                                    "DELETE FROM updates " +
                                        "WHERE group_name = ? " +
                                        "AND user = ?;",
                                    [group, member],
                                    function(err)
                                    {
                                        if(err)
                                        {//database error
                                            _finishResponse(500, response, err_msg.db_err);
                                        }
                                        else
                                        {
                                            _finishResponse(200, response);
                                        }
                                    });
                            }
                        });
                }
            });
        });
    }
    //endregion

    //region Groups Updates functions

    function _retrieveUpdates(username, group, clear)
    {//responds to a pending update subscription with all pending updates
        var i, clear_query;
        if(!hooks[group][username])
        {//user is not yet subscribed for updates
            return;
        }
        //construct the part of the query string that cleans up updates already received by user
        clear_query = '';
        for(i = 0; i < clear.length; i += 1)
        {
            clear_query += "id = " + connection.escape(clear[i]);
            if(i < clear.length - 1)
            {
                clear_query += " OR ";
            }
        }
        if(!clear_query)
        {
            clear_query = "0=1";
        }
        connection.query(
            "DELETE FROM updates " +
                "WHERE group_name = ? " +
                "AND user = ? AND " +
                "(" + clear_query + ");",
            [group, username],
            function(err)
            {
                if(err)
                {//database error
                    _finishResponse(500, hooks[group][username], err_msg.db_err);
                }
                else
                {
                    connection.query(
                        "SELECT field, id " +
                            "FROM updates " +
                            "WHERE group_name = ? " +
                            "AND user = ?",
                        [group, username],
                        function(err, updates){
                            if(err)
                            {//database error
                                _finishResponse(500, hooks[group][username], err_msg.db_err);
                            }
                            else if(updates.length > 0) //only retrieve if there are new updates
                            {
                                var fields, ids, data, query_fields;
                                fields = [];//array of updated field names
                                ids = [];//array of update id numbers
                                for(i = 0; i < updates.length; i += 1)
                                {
                                    fields.push(updates[i].field);
                                    ids.push(updates[i].id);
                                }
                                //construct the part of the query string that finds data only of updated fields
                                query_fields = '';
                                for(i = 0; i < fields.length; i += 1)
                                {
                                    query_fields += "field = " + connection.escape(fields[i]);
                                    if(i < fields.length -1)
                                    {
                                        query_fields += " OR ";
                                    }
                                }
                                //retrieve data values under size limit for all updated fields
                                connection.query(
                                    "SELECT field, data " +
                                        "FROM group_data " +
                                        "WHERE group_name = ? " +
                                        "AND " + "(" + query_fields + ") " +
                                        "AND ? > CHAR_LENGTH(data);",
                                    [group, update_size_limits[group][username]],
                                    function(err, data_result)
                                    {
                                        if(err)
                                        {//database error
                                            _finishResponse(500, hooks[group][username], err_msg.db_err);
                                        }
                                        else
                                        {
                                            data = {};//object of field name : data pairs
                                            for(i = 0; i < data_result.length; i += 1)
                                            {
                                                data[data_result[i].field] = JSON.parse(data_result[i].data);
                                            }
                                            _finishResponse(200, hooks[group][username],
                                                {
                                                    updates: fields,
                                                    data: data,
                                                    clear: ids
                                                });
                                        }
                                    }
                                )
                            }
                        });
                }
            });
    }

    function _listenUpdates(session_id, group, clear, limit, response){
        if(typeof session_id !== 'string' || typeof group !== 'string' || !_isJSON(clear) || !_isJSON(limit))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        clear = JSON.parse(clear);
        limit = JSON.parse(limit);
        if(!(clear instanceof Array) || typeof limit !== 'number')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username){
            connection.query(
                "SELECT 1 " +
                    "FROM groups WHERE " +
                    "name = ?;",
                [group, username],
                function(err, result)
                {
                    if(err)
                    {//database error
                        _finishResponse(500, response, err_msg.db_err);
                    }
                    else if(result.length === 0)
                    {//group not found
                        _finishResponse(404, response, err_msg.no_group);
                    }
                    else
                    {
                        hooks[group][username] = response;
                        update_size_limits[group][username] = limit;
                        _retrieveUpdates(username, group, clear);
                    }
                });
        });
    }
    //endregion

    //region Groups Input functions
    function _retrieveInput(group, clear)
    {//responds to host of a group with all pending inputs
        connection.query(
            "SELECT host " +
                "FROM groups " +
                "WHERE name = ? " +
                "LIMIT 1;",
            [group],
            function(err, host)
            {
                var i, clear_query;
                if(!hooks[group][host[0].host])
                {//host is not listening for inputs
                    return;
                }
                clear_query = '';
                for(i = 0; i < clear.length; i += 1)
                {
                    clear_query += 'id = ' + connection.escape(clear[i]);
                    if(i < clear.length - 1)
                    {
                        clear_query += " OR ";
                    }
                }
                if(!clear_query)
                { //dont delete anything if nothing to clear
                    clear_query = "0 = 1"
                }
                connection.query(
                    "DELETE FROM inputs WHERE group_name = ? AND (" + clear_query + ");",
                    [group],
                    function(err)
                    {
                        if(err)
                        {//database error
                            _finishResponse(500, hooks[group][host[0].host], err_msg.db_err);
                        }
                        else
                        {
                            connection.query(
                                "SELECT user, input, time, id " +
                                    "FROM inputs " +
                                    "WHERE group_name = ?",
                                [group],
                                function(err, input)
                                {
                                    if(err)
                                    {//database error
                                        _finishResponse(500, hooks[group][host[0].host], err_msg.db_err);
                                    }
                                    else if(input.length > 0)
                                    {//if there are any new inputs to report
                                        var contents, ids;
                                        contents = [];//array of input objects
                                        ids = []; //id numbers of inputs
                                        for(i = 0; i < input.length; i += 1)
                                        {//construct inputs object to be returned with response
                                            contents.push(
                                                {
                                                    user: input[i].user,
                                                    input: JSON.parse(input[i].input),
                                                    time: input[i].time
                                                });
                                            ids.push(input[i].id);
                                        }
                                        _finishResponse(200, hooks[group][host[0].host], {inputs: contents, clear: ids});
                                    }
                                });
                        }
                    });
            });
    }

    //subscribe to inputs being sent to a group you host
    function _listenInputs(session_id, group, clear, response){
        if(typeof session_id !== 'string' || typeof group !== 'string' || !_isJSON(clear))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        clear = JSON.parse(clear);
        if(!(clear instanceof Array))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username){
            _checkHost(username, group, response, function(){
                hooks[group][username] = response;
                _retrieveInput(group, clear);
            });
        });
    }

    function _submitInput(session_id, group, input, response){
        if(typeof session_id !== 'string' || typeof group !== 'string' || !_isJSON(input))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username){
            connection.query(
                "INSERT INTO inputs " +
                    "VALUES (?, ?, ?, ?, ?);",
                [group, username, input, new Date().getTime(), Math.random() * Number.MAX_VALUE],
                function(err){
                    if(err)
                    {//database error
                        _finishResponse(500, response, err_msg.db_err);
                    }
                    else {
                        _finishResponse(200, response);
                        _retrieveInput(group, []);
                    }
                });
        });
    }
    //endregion

    //region Group Permissions functions
    function _insertPermissions(group, permitted_values, update_values, updated_members, response)
    {
        connection.query(
            "INSERT INTO permissions " +
                "VALUES " + permitted_values +
                " ON DUPLICATE KEY UPDATE field = field",
            function(err)
            {
                if(err)
                {//database error
                    _finishResponse(500, response, err_msg.db_err);
                }
                else
                {
                    connection.query(
                        "INSERT INTO updates " +
                            "VALUES" + update_values +
                            " ON DUPLICATE KEY UPDATE " +
                            "time = VALUES(time);",
                        function(err)
                        {
                            if(err)
                            {//database error
                                _finishResponse(500, response, err_msg.db_err);
                            }
                            else
                            {
                                var i;
                                _finishResponse(200, response);
                                for (i = 0; i < updated_members.length; i += 1)
                                {//tell all affected members they have new updates
                                    _retrieveUpdates(updated_members[i], group, []);
                                }
                            }
                        });
                }
            });
    }

    function _formatPermissions(fields, members, permissions, username)
    {//returns false if failure, object containing formatted field, members, and permissions if success
        var i, j;
        //format the fields parameter into a single dimensional array of field names
        if(!_isJSON(fields))
        {//if field isn't json, invalid argument
            return false;
        }
        fields = JSON.parse(fields);
        if(typeof fields === 'string')
        {//turn single string field into a 1-element array
            fields = [fields];
        }
        else if(!(fields instanceof Array) || fields.length === 0)
        {//if not an array and not a string, or if array of length 0, invalid argument
            return false;
        }
        //format member into an array of names. if none present, array should contain host as sole element
        if(!members)
        { //set host as target member, which means universal permissions
            members = [username];
        }
        else if(_isJSON(members))
        {
            members = JSON.parse(members);
            if(typeof members === 'string')
            {//turn string into array
                members = [members];
            }
            else if(members instanceof Array)
            {
                for(i = 0; i < members.length; i +=1)
                {
                    if(typeof(members[i]) !== 'string')
                    {//must be either string or array of strings
                        return;
                    }
                }
            }
            else
            {//must be either string or array of strings
                return;
            }
        }
        else
        {//not the right type, cannot format
            return;
        }
        //format permissions into 2-dimensional array of booleans
        if(!permissions)
        {
            permissions = JSON.stringify(true);
        }
        if(_isJSON(permissions))
        {
            permissions = JSON.parse(permissions);
            if(typeof permissions === 'boolean')
            {
                permissions = [permissions];
            }
            if(!(permissions instanceof Array))
            {
                return;
            }
            for(i = 0; i < fields.length; i += 1)
            {
                if(permissions[i] === undefined)
                {
                    permissions[i] = permissions[0];
                }
                if(typeof permissions[i] === 'boolean')
                {
                    permissions[i] = [permissions[i]];
                }
                if(!(permissions[i] instanceof Array))
                {
                    return;
                }
                for(j = 0; j < members.length; j += 1)
                {
                    if(permissions[i][j] === undefined)
                    {
                        permissions[i][j] = permissions[i][0];
                    }
                    if(typeof permissions[i][j] !== 'boolean')
                    {
                        return
                    }
                }
            }
        }
        else
        {
            return;
        }
        return {fields: fields, members: members, permissions: permissions};
    }

    function _setPermissions(session_id, group, fields, members, permissions, response)
    {
        _checkCredentials(session_id, response, function(username)
        {
            _checkHost(username, group, response, function()
            {
                var formatted = _formatPermissions(fields, members, permissions, username);
                if(!formatted || typeof session_id !== 'string' || typeof group !== 'string')
                {
                    _finishResponse(400, response, err_msg.incorrect_arg);
                    return;
                }
                var i, j, permitted_values, forbidden_values, update_values, shared_fields, updated_members;
                permitted_values = ''; //values to be inserted into the permissions table
                forbidden_values = '';//values to be removed from the permissions table
                update_values = ''; //values to be inserted into the updates table
                updated_members = []; //array of names of users who have new updates from this function call
                for(i = 0; i < formatted.fields.length; i += 1)
                {//for each field
                    for(j = 0; j < formatted.members.length; j += 1)
                    {//for each member
                        if(formatted.permissions[i][j]) //granting permission
                        {
                            if(updated_members.indexOf(formatted.members[j]) === -1 &&
                                formatted.members[j] !== username)
                            { //add members[j] to updated list if not already in it
                                updated_members.push(formatted.members[j]);
                            }
                            shared_fields = "("
                                + connection.escape(group) + ","
                                + connection.escape(formatted.members[j]) + ","
                                + connection.escape(formatted.fields[i]);
                            permitted_values += shared_fields + "),";
                            update_values +=
                                shared_fields + ',' +
                                    new Date().getTime() + ',' +
                                    Math.random() * Number.MAX_VALUE + "),";
                        }
                        else //revoking permission
                        {
                            forbidden_values +=
                                " (field = " + connection.escape(formatted.fields[i]) +
                                    " AND user = " + connection.escape(formatted.members[j]) + ") OR";
                        }
                    }
                    if(forbidden_values)
                    {
                        forbidden_values = forbidden_values.slice(0, -2); //cut off trailing OR
                        connection.query(
                            "DELETE FROM permissions " +
                                "WHERE group_name = ? " +
                                "AND ( " + forbidden_values + " );",
                            [group],
                            function(err)
                            {
                                if(err)
                                {//database error
                                    _finishResponse(500, response, err_msg.db_err);
                                }
                                else if(permitted_values)
                                {//new permissions were granted, so notify users
                                    permitted_values = permitted_values.slice(0, -1);//cut off trailing commas
                                    update_values = update_values.slice(0, -1);//cut off trailing commas
                                    _insertPermissions(group, permitted_values, update_values, updated_members, response);
                                }
                                else
                                {
                                    _finishResponse(200, response);
                                }
                            });
                    }
                    else if(permitted_values)
                    {
                        permitted_values = permitted_values.slice(0, -1);
                        update_values = update_values.slice(0, -1);
                        _insertPermissions(group, permitted_values, update_values, updated_members, response);
                    }
                    else
                    {
                        _finishResponse(200, response);
                    }
                }
            });
        });
    }
    //endregion

    //region Group Data functions

    function _submitUpdates(session_id, group, fields, data, permissions, members, response)
    {
        _checkCredentials(session_id, response, function(username)
        {
            _checkHost(username, group, response, function()
            {
                var formatted = _formatPermissions(fields, members, permissions, username);
                if(!formatted || typeof session_id !== 'string' || typeof group !== 'string' || !_isJSON(data))
                {
                    _finishResponse(400, response, err_msg.incorrect_arg);
                    return;
                }
                data = JSON.parse(data);
                if(formatted.fields.length === 1)
                {//data should be interpreted as a single element if only one field
                    data = [data];
                }
                else if(!(data instanceof Array) || formatted.fields.length !== data.length)
                {//incorrect argument
                    _finishResponse(400, response, err_msg.incorrect_args);
                    return;
                }
                var i, data_values, query_fields;
                data_values = '';
                query_fields = '';
                for(i = 0; i < formatted.fields.length; i += 1)
                {
                    if(typeof(formatted.fields[i]) !== 'string')
                    {//incorrect argument type
                        _finishResponse(400, response, err_msg.incorrect_args);
                        return;
                    }
                    data_values += "("
                        + connection.escape(group) + ","
                        + connection.escape(formatted.fields[i]) + ","
                        + connection.escape(JSON.stringify(data[i])) + ")";
                    query_fields += "field = " + connection.escape(formatted.fields[i]);
                    if(i < formatted.fields.length -1)
                    {
                        data_values += ",";
                        query_fields += " OR ";
                    }
                }
                connection.query(
                    "INSERT INTO group_data " +
                        "VALUES " +data_values+
                        " ON DUPLICATE KEY " +
                        "UPDATE data = VALUES(data);",
                    function(err)
                    {
                        if(err)
                        {//database error
                            _finishResponse(500, response, err_msg.db_err);
                        }
                        else
                        {
                            connection.query(
                                "SELECT user, field " +
                                    "FROM permissions " +
                                    "WHERE group_name = ? " +
                                    "AND" + "(" + query_fields + ");",
                                [group],
                                function(err, result)
                                {
                                    if(err)
                                    {//database error
                                        _finishResponse(500, response, err_msg.db_err);
                                    }
                                    else
                                    {
                                        var update_values = '';
                                        var updated_members = [];
                                        for(i = 0; i < result.length; i += 1)
                                        {
                                            if(updated_members.indexOf(result[i].user) === -1 && result[i].user !== username)
                                            {
                                                updated_members.push(result[i].user);
                                            }
                                            update_values += "("
                                                + connection.escape(group) + ','
                                                + connection.escape(result[i].user) + ','
                                                + connection.escape(result[i].field) + ','
                                                + new Date().getTime() + ','
                                                + connection.escape(Math.random() * Number.MAX_VALUE) + ')';
                                            if(i < result.length - 1)
                                            {
                                                update_values +=  ',';
                                            }
                                        }
                                        if(update_values)
                                        {
                                            connection.query("INSERT INTO updates VALUES " + update_values +
                                                'ON DUPLICATE KEY UPDATE time = VALUES(time);',
                                                function(err)
                                                {
                                                    if(err)
                                                    {//database error
                                                        _finishResponse(500, response, err_msg.db_err);
                                                    }
                                                    else
                                                    {
                                                        for(i = 0; i < updated_members.length; i += 1)
                                                        {
                                                            _retrieveUpdates(updated_members[i], group, []);
                                                        }
                                                        if(permissions)
                                                        {
                                                            _setPermissions(
                                                                session_id,
                                                                group,
                                                                JSON.stringify(formatted.fields),
                                                                JSON.stringify(formatted.members),
                                                                JSON.stringify(formatted.permissions),
                                                                response);
                                                        }
                                                        else
                                                        {
                                                            _finishResponse(200, response);
                                                        }
                                                    }
                                                });
                                        }
                                        else
                                        {
                                            if(permissions)
                                            {
                                                _setPermissions(
                                                    session_id,
                                                    group,
                                                    JSON.stringify(formatted.fields),
                                                    JSON.stringify(formatted.members),
                                                    JSON.stringify(formatted.permissions),
                                                    response);
                                            }
                                            else
                                            {
                                                _finishResponse(200, response);
                                            }
                                        }
                                    }
                                });
                        }
                    });
            });
        });
    }

    function _getGroupData(session_id, group, field, response)
    {
        if(typeof session_id !== 'string' || typeof group !== 'string' || !_isJSON(field))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        field = JSON.parse(field);
        if(typeof field === 'string')
        {//make field into an 1-element array if string
            field = [field];
        }
        else if(!(field instanceof Array) || field.length === 0)
        {//field must be an array of at least length 1
            _finishResponse(400, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            var i, query_fields;
            query_fields = '';//fields to get data from
            for(i = 0; i < field.length; i += 1){
                if(typeof field[i] !== 'string')
                {//argument is of incorrect type
                    _finishResponse(400, response, err_msg.incorrect_args);
                    return;
                }
                query_fields += "field = " + connection.escape(field[i]);
                if(i < field.length -1)
                {
                    query_fields += " OR ";
                }
            }
            connection.query("SELECT host FROM groups WHERE name = ? LIMIT 1;",
                [group],
                function(err, host)
                {
                    if(err)
                    {//database error
                        _finishResponse(500, response, err_msg.db_err);
                    }
                    else if(host.length === 0)
                    {//group doesnt exist
                        _finishResponse(404, response, err_msg.no_group);
                    }
                    else if(host[0].host === username)
                    {//if host is requesting data, skip checking permissions
                        connection.query("SELECT field, data FROM group_data WHERE group_name = ? AND " +
                            "(" + query_fields + ");",
                            [group],
                            function(err, result)
                            {
                                if(err)
                                {//database error
                                    _finishResponse(500, response, err_msg.db_err);
                                }
                                else
                                {
                                    var data = {};
                                    for(i = 0; i < result.length; i += 1)
                                    {
                                        data[result[i].field] = JSON.parse(result[i].data);
                                    }
                                    _finishResponse(200, response, {data: data});
                                }
                            });
                    }
                    else
                    {
                        connection.query("SELECT field FROM permissions WHERE group_name = ? AND " +
                            "(user = ? OR user = ?) AND " +
                            "(" + query_fields + ");",
                            [group, username, host[0].host, username],
                            function(err, result)
                            {
                                if(err)
                                {//database error
                                    _finishResponse(500, response, err_msg.db_err);
                                }
                                else
                                {
                                    var permitted_fields = '';
                                    for(i = 0; i < result.length; i += 1)
                                    {
                                        permitted_fields += "field = " + connection.escape(result[i].field);
                                        if(i < result.length -1)
                                        {
                                            permitted_fields += " OR ";
                                        }
                                    }
                                    if(permitted_fields)
                                    {
                                        connection.query("SELECT field, data FROM group_data WHERE group_name = ? AND" +
                                            "(" + permitted_fields + ");",
                                            [group],
                                            function(err, result)
                                            {
                                                if(err)
                                                {
                                                    _finishResponse(500, response, err_msg.db_err);
                                                }
                                                else{
                                                    var data = {};
                                                    for(i = 0; i < result.length; i += 1)
                                                    {
                                                        data[result[i].field] = JSON.parse(result[i].data);
                                                    }
                                                    _finishResponse(200, response, {data: data});
                                                }
                                            });
                                    }
                                    else
                                    {
                                        _finishResponse(200, response, {data: {}});
                                    }
                                }
                            });
                    }
                });
        });
    }
    //endregion

    //region Processing Functions
    function _processRequest(request, response)
    {
        var data = '';
        request.on('data', function(data_part) //collect and concatenate all parts of the request body
        {
            data += data_part;
        });
        request.on('end', function() //once request has been fully received, parse and pass to appropriate function
        {
            var parsed_url = url.parse(request.url, true);
            switch(parsed_url.pathname )
            {
                case "/users":
                    switch(request.method)
                    {
                        case "GET":
                            _checkUserRegistered(parsed_url.query.username, response);
                            break;
                        case "POST":
                            _register(parsed_url.query.username, data, parsed_url.query.timeout, response);
                            break;
                        case "DELETE":
                            _unregister(parsed_url.query.session_id, response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, POST, DELETE, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.request_err);
                    }
                    break;
                case "/users/session":
                    switch(request.method)
                    {
                        case "PUT":
                            _login(parsed_url.query.username, data, response);
                            break;
                        case "DELETE":
                            _logout(parsed_url.query.session_id, response);
                            break;
                        case "OPTIONS":
                            _respondOptions('PUT, DELETE, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.request_err);
                    }
                    break;
                case "/users/password":
                    switch(request.method)
                    {
                        case "GET":
                            _recoverPassword(parsed_url.query.username, response);
                            break;
                        case "PUT":
                            _changePassword(parsed_url.query.session_id, data, response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, PUT, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.request_err);
                    }
                    break;
                case "/users/data":
                    switch(request.method)
                    {
                        case "PUT":
                            _putData(
                                parsed_url.query.session_id,
                                parsed_url.query.app,
                                parsed_url.query.field,
                                data,
                                response);
                            break;
                        case "GET":
                            _getData(
                                parsed_url.query.session_id,
                                parsed_url.query.app,
                                parsed_url.query.field,
                                response);
                            break;
                        case "DELETE":
                            _deleteData(
                                parsed_url.query.session_id,
                                parsed_url.query.app,
                                parsed_url.query.field,
                                response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, PUT, DELETE, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.request_err);
                    }
                    break;
                case "/groups":
                    switch(request.method)
                    {
                        case "POST":
                            _startGroup(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.app,
                                data,
                                response);
                            break;
                        case "GET":
                            _listGroupsOfApp(parsed_url.query.app, response);
                            break;
                        case "DELETE":
                            _closeGroup(parsed_url.query.session_id, parsed_url.query.group, response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, POST, DELETE, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.request_err);
                    }
                    break;
                case "/groups/members":
                    switch(request.method)
                    {
                        case "POST":
                            _addMember(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.username,
                                response);
                            break;
                        case "GET":
                            _listMembersOfGroup(parsed_url.query.group, response);
                            break;
                        case "DELETE":
                            _removeMember(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.username,
                                response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, POST, DELETE, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.request_err);
                    }
                    break;
                case "/groups/data":
                    switch(request.method){
                        case "PUT":
                            _submitUpdates(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.fields,
                                data,
                                parsed_url.query.permissions,
                                parsed_url.query.members,
                                response);
                            break;
                        case "GET":
                            _getGroupData(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.field,
                                response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, PUT, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.request_err);
                    }
                    break;
                case "/groups/data/permissions":
                    switch(request.method){
                        case "PUT":
                            _setPermissions(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.fields,
                                parsed_url.query.username,
                                parsed_url.query.permissions,
                                response);
                            break;
                        case "OPTIONS":
                            _respondOptions('PUT, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.request_err);
                    }
                    break;
                case "/groups/updates":
                    switch(request.method){
                        case "GET":
                            _listenUpdates(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.clear,
                                parsed_url.query.limit,
                                response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.request_err);
                    }
                    break;
                case "/groups/input":
                    switch(request.method){
                        case "POST":
                            _submitInput(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                data,
                                response);
                            break;
                        case "GET":
                            _listenInputs(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.clear,
                                response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, POST, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.request_err);
                    }
                    break;
                default:
                    _finishResponse(400, response, err_msg.request_err);
            }
        });
    }

    //endregion

    //region Initialization Calls
    _connect();
    connection.query('DROP DATABASE IF EXISTS knecht'); //TODO: remove in final version
    _initDatabase();
    http.createServer(_processRequest).listen(port);
    //endregion
} () );
