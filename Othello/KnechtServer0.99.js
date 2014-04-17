(function()
{
    "use strict";
    //region Configuration Variables
    var port = 8088; //Port on this server that Knecht will be listening on
    var access_whitelist = '*'; //domains allowed to send requests to this server
    var db_config =
    { //authentication variables and column lengths for the mysql server
        host: 'localhost',
        user: 'root',
        password:'7Frog1ufo6',
        reconnect_delay: 2000,
        column_length: //Note: column length variables only apply if tables do not already exist in the database
        {
            username: 255,
            password: 64,
            session: 32,
            application: 64,
            field: 64,
            data: 0xffffff,
            group_name: 64
        }
    };
    //endregion

    //region Global Variables
    var connection; //object representing the open connection to the mysql database
    //members are group names with object values, whose members are user names with pending response values
    var hooks = {};
    //members are group names with object values, whose members are user names with number values that are size limits
    //for data to be retrieved on update
    var update_size_limits = {};
    var err_msg =
    {//predefined response error messages
        invalid_args: {error: "Invalid arguments"},
        db_err: {error: "Database error"},
        req_err: {error: "Request error"},
        dup_user: {error: "Duplicate user"},
        invalid_session: {error: "Invalid session"},
        expired_session: {error: "Expired session"},
        no_user: {error: "User not found"},
        wrong_pass: {error: "Incorrect password"},
        dup_group: {error: "Duplicate group"},
        no_group: {error: 'Group not found'},
        not_host: {error: 'User not host'}
    };
    //endregion

    //region Node.js Modules
    var mysql = require('mysql'); //Node.js module for interacting with the mysql database
    var url = require('url'); //Node.js module for parsing request urls
    var http = require('http'); //Node.js module for handling http requests
    //endregion

    //region Response Functions

    /** This function constructs a well formatted response for ajax and returns it to the requesting client.
     * @param status is an integer that is a standard HTTP response code indicated the success or failure of the request
     * @param response is the http request that is waiting for the response from the server.
     * @param body this is an object that is the server's response to the query that this function is answering
     */
    function _finishResponse(status, response, body)
    {//applies headers to an http response and sends it to the client
        if( !body )
        { //if no body object provided, create an empty object
            body = {};
        }
        body.timestamp = new Date().getTime(); //number of milliseconds since midnight January 1, 1970
        response.writeHead(
            status,
            {
                'Content-Type': 'application/json', //tell browser that the response boy will be in JSON string format
                'Access-Control-Allow-Origin': access_whitelist, //allow whitelist domains to make requests
                'Cache-Control': 'no-cache, no-store, must-revalidate', //disallow caching of requests
                'Pragma': 'no-cache', //disallow caching of requests
                'Expires': 0 //disallow caching of requests
            });
        response.end( JSON.stringify( body ) ); //send the finished response back to client as JSON
        console.log( JSON.stringify( body ) );
    }

    /** This function returns a list of valid requests.
     * @param methods is a string that lists the valid http requests that can be made to this uri
     * @param response is the http request that is waiting for the response from the server
     */
    function _respondOptions( methods, response )
    { //sends an OPTIONS response to the client listing allowed methods on the requested resource
        response.writeHead(
            200,
            {
                'Access-Control-Allow-Origin': access_whitelist, //allow whitelisted domains to make requests
                'Access-Control-Allow-Methods': methods //list the methods that can be requested on this resource
            });
        response.end(); //send the finished response back to client
    }
    //endregion

    //region Authentication Functions

    /** This function responds with an error if the provided session is invalid or expired, otherwise executes callback
     * @param username is a string that identifies the user account
     * @param session is a string that identifies the user's current session
     * @param response is the http response object that is waiting for the response of this request
     * @param callback is the server side function that needs the credentials verified before it can execute
     */
    function _checkCredentials(username, session, response, callback)
    {
        if(typeof username !== 'string' || typeof session !== 'string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        connection.query(
            "SELECT timeout, last_ping FROM users WHERE username = ? AND session = ? LIMIT 1;",
            [ username, session ],
            function( err, res )
            {
                if(err)
                { //database error
                    _finishResponse(500, response, err_msg.db_err);
                    return;
                }
                else if(res.length === 0)
                {//no user found matching provided session key and username
                    _finishResponse(404, response, err_msg.invalid_session);
                    return;
                }
                else if(res[0].last_ping + res[0].timeout * 60000 <= new Date().getTime() )
                {//session_id expired
                    _finishResponse(401, response, err_msg.expired_session);
                    return;
                }
                //refresh the expiration countdown on this session
                connection.query(
                    "UPDATE users SET last_ping = ? WHERE username = ? LIMIT 1;",
                    [new Date().getTime(), res[0].username],
                    function(err)
                    {
                        if(err)
                        {//database error
                            _finishResponse(500, response, err_msg.db_err);
                            return;
                        }
                        callback();
                    }
                );
            }
        );
    }

    /** This function responds with an error if the provided group does not exist or if it is not hosted by the provided
     *  user, otherwise executes callback with no parameters
     * @param username is a string that is a username, hopefully the username of the host of the group
     * @param group_name is a string that is the name of the that username is supposedly the host of
     * @param response is the http response object that is waiting for the response of this request
     * @param callback is the function that will be executed if the host is valid
     */
    function _checkHost(username, group_name, response, callback)
    {
        if(typeof group_name !=='string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        connection.query(
            "SELECT host FROM groups WHERE group_name = ? LIMIT 1;",
            [group_name],
            function(err, result)
            {
                if(err)
                {//database error
                    _finishResponse(500, response, err_msg.db_err);
                    return;
                }
                else if (result.length === 0)
                {//group not found
                    _finishResponse(404, response, err_msg.no_group);
                    return;
                }
                else if(result[0].host !== username)
                {//user is not host
                    _finishResponse(403, response, err_msg.not_host);
                    return;
                }
                 callback();
            }
        );
    }
    //endregion

    /**
     * Checks whether a given string can be parsed as a JSON object
     * @param string the string to be tested
     * @returns {boolean} true if the string is valid JSON, false otherwise
     * @private
     */
    function _isJSON ( string )
    {
        try
        {
            JSON.parse( string );
        }
        catch ( e )
        {
            return false;
        }
        return true;
    }

    //region User functions

    //region Account functions

    /**
     * This function retrieves a list of users meeting some constraint
     * @param constraints object contain the name, group, and online constraints for this request
     * @param response object for replying to the client
     * @private
     */
    function _getUsers ( constraints, response )
    {
        if( !_isJSON( constraints) )
        {
            _finishResponse( 400, response, err_msg.invalid_args);
            return;
        }
        constraints = JSON.parse( constraints );
        var query = 'SELECT users.username FROM users ';
        var where_started = false;
        if( typeof constraints.group_name === 'string')
        {//only select users in the group
            query += ' INNER JOIN members ON users.username = members.username ' +
                'WHERE members.group_name = ' + connection.escape(constraints.group_name);
        }
        if( typeof constraints.username === 'string' )
        {//only select where usernames match
            query += where_started ? ' AND' : ' WHERE' + ' users.username = ' + connection.escape( constraints.username );
            where_started = true;
        }
        if( constraints.online === true)
        {//user must currently be online
            query += where_started ? ' AND' : ' WHERE' + ' users.last_ping + (users.timeout * 60000) >= ' + new Date().getTime();
        }
        query += ';';
        connection.query(
            query,
            function( err, res )
            {
                if( err )
                {
                    _finishResponse( 500, response, err_msg.db_err );
                }
                else
                {
                    var body = { users: [] };
                    var i;
                    for (i = 0; i < res.length; i +=1 )
                    {
                        body.users.push( res[i].username );
                    }
                    _finishResponse( 200, response, body );
                }
            }
        );
    }

    /** This functions adds a new account to the database.
     * @param username is a string that is the username and possible email address of the new account.
     * @param password is a string that is the password of the new account.
     * @param timeout is a string that names an integer ex. '15' or '60'.  It is the number of minutes a session remains
     * valid without activity
     * @param response is the http response object that is waiting for the response of this request
     */

    function _register( username, password, timeout, response )
    {//responds with member session of type string if successful. value is initial session_id
        if( !_isJSON( password ) )
        {//argument is wrong type
            _finishResponse( 400, response, err_msg.invalid_args );
            return;
        }
        password = JSON.parse( password );
        if( typeof username !== 'string' || typeof password !== 'string')
        {//argument is wrong type
            _finishResponse( 400, response, err_msg.invalid_args );
            return;
        }
        timeout = parseInt( timeout, 10 );
        if( isNaN( timeout ) )
        {//default timeout period is 15 minutes
            timeout = 15;
        }
        var session = Math.random().toString();
        connection.query(
            "INSERT INTO users VALUES (?, ?, ?, ?, ?);",
            [ username, password, timeout, session, new Date().getTime() ],
            function( err )
            {
                if( err )
                {//if user already exists, respond with duplicate user error message, otherwise database error message
                    if( err.code === "ER_DUP_ENTRY" )
                    {
                        _finishResponse( 403, response,  err_msg.dup_user );
                    }
                    else
                    {
                        _finishResponse( 500, response, err_msg.db_err );
                    }
                    return;
                }
                _finishResponse( 200, response, {session: session} );
            }
        );
    }

    /** Removes the given account from the database.
     * @param username is a string identifying the account to be removed
     * @param session is a string that identifies the user's current session.
     * @param response is the http response object that is waiting for the response of this request
     */
    function _unregister(username, session, response)
    {
        _checkCredentials( username, session, response, function()
        {
            connection.query(
                "DELETE FROM users WHERE username = ? LIMIT 1;",
                [ username ],
                function( err )
                {
                    if(err)
                    {//database error
                        _finishResponse( 500, response, err_msg.db_err);
                    }
                    else
                    {
                        _finishResponse( 200, response, null);
                    }
                }
            );
        });
    }

    /** This function creates a new session key for the account with the given username and password.
     * @param username is a string that is the username of the account to log in.
     * @param password is a string that is the password of the account to log in.
     * @param timeout is a string that names an integer ex. '15' or '60'.  It is the number of minutes a session remains
     * @param response is the http response object that is waiting for the response of this request
     */
    function _login( username, password, timeout, response )
    {
        if( typeof username !== 'string' || !_isJSON( password ) )
        {//argument is wrong type
            _finishResponse( 400, response, err_msg.invalid_args );
            return;
        }
        password = JSON.parse( password );
        if( typeof password !== 'string' )
        {//argument is wrong type
            _finishResponse( 400, response, err_msg.invalid_args );
            return;
        }
        timeout = parseInt( timeout, 10 );
        if( isNaN( timeout ) )
        {//default timeout period is 15 minutes
            timeout = 15;
        }
        connection.query("SELECT password FROM users WHERE username = ? LIMIT 1;",
            [username],
            function( err, result )
            {
                if( err )
                {//database error
                    _finishResponse( 500, response, err_msg.db_err );
                    return;
                }
                else if( result.length === 0 )
                {//user not found
                    _finishResponse( 404, response, err_msg.no_user );
                    return;
                }
                else if( result[0].password !== password )
                {//incorrect password
                    _finishResponse( 401, response, err_msg.wrong_pass );
                    return;
                }
                var session = Math.random().toString();
                connection.query(
                    "UPDATE users SET session = ?, timeout = ?, last_ping = ? WHERE username = ? LIMIT 1;",
                    [ session, timeout, new Date().getTime(), username ],
                    function( err )
                    {
                        if( err )
                        {//database error
                            _finishResponse( 500, response, err_msg.db_err );
                            return;
                        }
                        _finishResponse( 200, response, {session: session} );
                    }
                );
            }
        );
    }

    /** This function expires the given session_id if it is valid.
     * @param username string identifying the user to log out
     * @param session is a string that is the session id to be expired.
     * @param response is the http response object that is waiting for the response of this request
     */
    function _logout(username, session, response)
    {
        _checkCredentials(username, session, response, function()
            {//randomize session key without telling anyone to expire session
                connection.query(
                    "UPDATE users SET session = ? WHERE username = ? LIMIT 1;",
                    [ Math.random().toString(), username ],
                    function( err )
                    {
                        if( err )
                        {//database error
                            _finishResponse( 500, response, err_msg.db_err );
                            return;
                        }
                        _finishResponse( 200, response, null );
                    }
                );
            }
        );
    }

    /** This function will send an email with the user's password to their email address
     * @param username is a string that is a username of a registered account, treated as email address
     * @param response is the http response object that is waiting for the response of this request.
     */
    function _recoverPassword(username, response)
    {//treats username as an email address to send password details to
        if(typeof username !== 'string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        connection.query(
            "SELECT 1 FROM users WHERE username = ? LIMIT 1;",
            [ username ],
            function( err, res )
            {
                if( err )
                {//database error
                    _finishResponse(500, response, err_msg.db_err);
                    return;
                }
                else if(res === 0)
                {//user not found
                    _finishResponse(404, response, err_msg.no_user);
                    return;
                }
                //TODO: send recovery email
                _finishResponse(200, response, null);//no guarantee that email is actually received, only that it is sent
            });
    }

    /** This function alters the password of account associated with the given session id.
     * @param username string identifying the user whose password will be changed
     * @param session is a string that is the current session of the user
     * @param password is a string that is the account's new password.
     * @param response is the http response object that is waiting for the response of this request.
     */
    function _changePassword(username, session, password, response)
    {
        if( !_isJSON( password ) )
        {//argument is wrong type
            _finishResponse( 400, response, err_msg.invalid_args );
            return;
        }
        password = JSON.parse( password );
        if( typeof password !== 'string' )
        {//argument is wrong type
            _finishResponse( 400, response, err_msg.invalid_args );
            return;
        }
        _checkCredentials( username, session, response, function()
        {
            connection.query(
                "UPDATE users SET password = ? WHERE username = ? LIMIT 1;",
                [ password, username ],
                function( err )
                {
                    if( err )
                    {//database error
                        _finishResponse( 500, response, err_msg.db_err );
                        return;
                    }
                    _finishResponse( 200, response, null );
                });
        });
    }

    //endregion

    //region Data functions

    /**
     * Inserts single-player data into the database, accessible only to the owning user
     * @param username string identifying the user
     * @param session string identifying the user's current session
     * @param application string identifying the application the data is associated with
     * @param field string or array of strings giving fields to be updated
     * @param data arbitrary data or array of arbitrary data to be inserted into given fields
     * @param response response object for replying to client
     * @private
     */
    function _putData(username, session, application, field, data, response)
    {//data and field are both either strings or arrays of strings with the same number of elements
        if( typeof application !== 'string' || !_isJSON(field) || !_isJSON(data))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.invalid_args);
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
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        _checkCredentials(username, session, response, function()
        {
            var values = '';//entry values to be inserted into user_data table
            var i;
            for(i = 0; i < field.length; i += 1)
            { //for each field to be updated, add an entry to the values string
                if(typeof field[ i ] !== 'string')
                {//argument is of wrong type
                    _finishResponse( 400, response, err_msg.invalid_args );
                    return;
                }
                values += "("
                    + connection.escape( username ) + ","
                    + connection.escape( application ) + ","
                    + connection.escape( field[ i ] ) + ","
                    + connection.escape( JSON.stringify( data[ i ] ) ) + ")";
                if( i < field.length -1 )
                {
                    values += ",";
                }
            }
            connection.query(
                "INSERT INTO user_data VALUES " + values +
                    " ON DUPLICATE KEY UPDATE data = VALUES(data);",
                function(err)
                {
                    if(err)
                    {//database error
                        _finishResponse(500, response, err_msg.db_err );
                        return;
                    }
                    _finishResponse( 200, response, null );
                }
            );
        });
    }

    /**
     * Retrieves single-player data from the database
     * @param username string identifying requesting user
     * @param session string identifying user's current session
     * @param application string identifying application the data is associated with
     * @param field string identifying the fields to be retrieved
     * @param response object for replying to client
     * @private
     */
    function _getData( username, session, application, field, response )
    {
        if( typeof application !== 'string' || !_isJSON( field ) )
        {//argument is wrong type
            _finishResponse( 400, response, err_msg.invalid_args );
            return;
        }
        field = JSON.parse(field);
        if(typeof field === 'string')
        {//massage field into array so it can be processed
            field = [field];
        }
        else if(!(field instanceof Array))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        _checkCredentials(username, session, response, function()
        {
            var query_fields = '';//fields to be queried for their data values
            var i;
            for(i = 0; i < field.length; i += 1){
                if(typeof field[i] !== 'string')
                {//argument is wrong type
                    _finishResponse(400, response, err_msg.invalid_args);
                    return;
                }
                query_fields += "field = " + connection.escape(field[i]);
                if(i < field.length -1)
                {
                    query_fields += " OR ";
                }
            }
            connection.query(
                "SELECT field, data FROM user_data WHERE username = ? AND application = ? AND (" + query_fields + ");",
                [username, application],
                function( err, res )
                {
                    if( err )
                    {//database error
                        _finishResponse( 500, response, err_msg.db_err );
                    }
                    else
                    {//process result into an object matching field names to their data values
                        var data = {};
                        for(i = 0; i < res.length; i += 1)
                        {//for each field that returned a result
                            data[res[i].field] = JSON.parse(res[i].data);
                        }
                        _finishResponse(200, response, {data: data});
                    }
                }
            );
        });
    }

    /**
     * Removes single-player user data from the server
     * @param username string identifying requesting user
     * @param session string identifying user's current session
     * @param application string identifying application the data is associated with
     * @param field string identifying the fields to be deleted
     * @param response object for replying to client
     */
    function _deleteData(username, session, application, field, response)
    {//field can be either a single string or an array of string
        if( typeof application !== 'string' || !_isJSON(field))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        field = JSON.parse(field);
        if(typeof field === 'string')
        {//massage field to be array so it can be processed
            field = [field];
        }
        else if(!(field instanceof Array))
        {//argument is wrong type
            _finishResponse( 400, response, err_msg.invalid_args );
            return;
        }
        _checkCredentials( username, session, response, function()
        {
            var query_fields = '';//field names to be deleted
            var i;
            for(i = 0; i < field.length; i += 1)
            {
                if(typeof field[i] !== 'string')
                {//argument is wrong type
                    _finishResponse(400, response, err_msg.invalid_args);
                    return;
                }
                query_fields += "field = " + connection.escape(field[i]);
                if(i < field.length -1)
                {
                    query_fields += " OR ";
                }
            }
            connection.query(
                "DELETE FROM user_data WHERE username = ? AND application = ? AND (" + query_fields + ");",
                [username, application],
                function(err)
                {
                    if(err)
                    {//database error
                        _finishResponse(500, response, err_msg.db_err);
                    }
                    else
                    {
                        _finishResponse(200, response, null);
                    }
                }
            );
        });
    }

    //endregion

    //endregion

    //region Group functions

    //region Group functions

    /**
     * This function retrieves a list of users meeting some constraint
     * @param constraints object contain the username, group_name, and application constraints for this request
     * @param response object for replying to the client
     * @private
     */
    function _getGroups ( constraints, response )
    {
        if( !_isJSON( constraints) )
        {
            _finishResponse( 400, response, err_msg.invalid_args);
            return;
        }
        constraints = JSON.parse( constraints );
        var query = 'SELECT groups.group_name FROM groups ';
        var where_started = false;
        if( typeof constraints.username === 'string' )
        {//only select where user is in group
            query += ' INNER JOIN members ON groups.group_name = members.group_name ' +
                'WHERE members.username = ' + connection.escape(constraints.username);
            where_started = true;
        }
        if( typeof constraints.group_name === 'string')
        {//only select users in the group
            query += where_started ? ' AND' : ' WHERE' + ' groups.group_name = ' + connection.escape(constraints.group);
            where_started = true;
        }
        if( typeof constraints.application === 'string')
        {//user must currently be online
            query += where_started ? ' AND' : ' WHERE' + ' groups.application = ' + connection.escape(constraints.application);
        }
        query += ';';
        connection.query(
            query,
            function( err, res )
            {
                if( err )
                {
                    _finishResponse( 500, response, err_msg.db_err );
                }
                else
                {
                    var body = { groups: [] };
                    var i;
                    for (i = 0; i < res.length; i +=1 )
                    {
                        body.groups.push( res[i].group_name );
                    }
                    _finishResponse( 200, response, body );
                }
            }
        );
    }

    /**
     * Starts a group with the requesting user as host
     * @param username name of the requesting user
     * @param session requesting user's current session key
     * @param group_name name to be given to the group
     * @param application application the group is using
     * @param response object for replying to client
     * @private
     */
    function _startGroup(username, session, group_name, application, response)
    {
        if( typeof group_name !== 'string' || typeof application !=='string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        _checkCredentials(username, session, response, function()
        {
            connection.query(
                "INSERT INTO groups VALUES (?, ?, ?);",
                [group_name, application, username],
                function(err)
                {
                    if(err)
                    {
                        if(err.code === "ER_DUP_ENTRY")
                        {//group already exists
                            _finishResponse(403, response, err_msg.dup_group);
                            return;
                        }
                        else
                        {//database error
                            _finishResponse(500, response, err_msg.db_err);
                            return;
                        }
                    }
                    connection.query(
                        "INSERT INTO members VALUES (?, ?);",
                        [group_name, username],
                        function(err)
                        {
                            if(err)
                            {//database error
                                _finishResponse(500, response, err_msg.db_err);
                                return;
                            }
                            hooks[group_name] = {}; //create object to hold pending responses for this group
                            update_size_limits[group_name] = {}; //create object to hold app-specified data size limits
                            _finishResponse(200, response, null);
                        }
                    );
                }
            );
        });
    }

    /**
     * Closes a group that the requesting user is host of
     * @param username name of requesting user
     * @param session requesting user's current session key
     * @param group_name name of group to close
     * @param response object for replying to client
     * @private
     */
    function _closeGroup(username, session, group_name, response)
    {
        _checkCredentials(username, session, response, function()
        {
            _checkHost(username, group_name, response, function()
            {
                connection.query(
                    "DELETE FROM groups WHERE group_name = ? LIMIT 1;",
                    [group_name],
                    function(err)
                    {
                        if(err)
                        {//database error
                            _finishResponse(500, response, err_msg.db_err);
                        }
                        else {
                            var member;
                            _finishResponse(200, response, null);
                            for(member in hooks[group_name]){//notify group members that group is closed
                                if (hooks[group_name].hasOwnProperty(member))
                                {
                                    _finishResponse(200, hooks[group_name][member], null);
                                }
                            }
                            delete hooks[group_name];
                        }
                    });
            });
        });
    }

    //endregion

    //region Member functions

    /**
     * Adds a user to the member list of a group so that they can receive updates
     * @param username the account name of the calling user
     * @param session the calling user's current session key
     * @param group_name the name of the group
     * @param member the name of the user to be added
     * @param response object for replying to client
     * @private
     */
    function _addMember(username, session, group_name, member, response)
    {
        if( typeof member !== 'string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        _checkCredentials(username, session, response, function()
        {
            _checkHost(username, group_name, response, function(){
                connection.query(
                    "INSERT INTO members VALUES (?, ?);",
                    [group_name, member],
                    function(err)
                    {
                        if(err)
                        {
                            if(err.code === "ER_DUP_ENTRY")
                            {//member is already in group
                                _finishResponse(403, response, err_msg.dup_user);
                            }
                            else
                            {//database error
                                _finishResponse(500, response, err_msg.db_err);
                            }
                        }
                        else
                        { //notify the new member of all the public data they have access to
                            connection.query("SELECT field FROM permissions WHERE group_name = ? AND username = ?;",
                                [group_name, username],
                                function(err, result)
                                {
                                    if(err)
                                    {//database error
                                        _finishResponse(500, response, err_msg.db_err);
                                    }
                                    else
                                    {
                                        var updates = '';
                                        var i;
                                        for(i = 0; i < result.length; i += 1)
                                        {
                                            updates += "(" +
                                                connection.escape(group_name) + ',' +
                                                connection.escape(member) + ',' +
                                                connection.escape(result[i].field) + ',' +
                                                new Date().getTime() + ',' +
                                                Math.random() * Number.MAX_VALUE + ')';
                                            if(i < result.length - 1)
                                            {
                                                updates += ',';
                                            }
                                        }
                                        if(updates)
                                        {
                                            connection.query("INSERT INTO updates VALUES " + updates + ';',
                                                function(err)
                                                {
                                                    if(err)
                                                    {//database error
                                                        _finishResponse(500, response, err_msg.db_err);
                                                        return;
                                                    }
                                                    _finishResponse(200, response, null);
                                                }
                                            );
                                        }
                                        else
                                        {
                                            _finishResponse(200, response, null);
                                        }
                                    }
                                }
                            );
                        }
                    }
                );
            });
        });
    }

    /**
     * Removes a user from a group's member list
     * @param username the account name of the calling user
     * @param session the calling user's current session key
     * @param group_name the name of the group
     * @param member the name of the user to be removed
     * @param response object for replying to client
     * @private
     */
    function _removeMember(username, session, group_name, member, response)
    {//removes a user from a group and deletes their pending notifications
        if( typeof member !== 'string')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        _checkCredentials(username, session, response, function()
        {
            _checkHost(username, group_name, response, function()
            {
                if(username === member)
                {//host has quit, close group instead
                    _closeGroup(username, session, group_name, response);
                }
                else
                { //clear up the removed user's info in the group
                    if(hooks[group_name][member])
                    {
                        _finishResponse(200, hooks[group_name][member], null);
                    }
                    connection.query(
                        "DELETE FROM members WHERE group_name = ? AND username = ? LIMIT 1;",
                        [group_name, member],
                        function(err)
                        {
                            if(err)
                            {//database error
                                _finishResponse(500, response, err_msg.db_err);
                            }
                            else
                            {//clean up update notifications
                                connection.query(
                                    "DELETE FROM updates WHERE group_name = ? AND username = ?;",
                                    [group_name, member],
                                    function(err)
                                    {
                                        if(err)
                                        {//database error
                                            _finishResponse(500, response, err_msg.db_err);
                                        }
                                        else
                                        {
                                            _finishResponse(200, response, null);
                                        }
                                    }
                                );
                            }
                        }
                    );
                }
            });
        });
    }
    //endregion

    //region Data functions

    /**
     * Compiles pending updates and sends them to the waiting client, if possible
     * @param username the user being updated
     * @param group_name the group the updates are for
     * @param clear array of update ids the user has acknowledged and can now be deleted from the database
     * @private
     */
    function _retrieveUpdates(username, group_name, clear)
    {//responds to a pending update subscription with all pending updates
        var i, clear_query;
        if(!hooks[group_name][username])
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
            "DELETE FROM updates WHERE group_name = ? AND username = ? AND (" + clear_query + ");",
            [group_name, username],
            function(err)
            {
                if(err)
                {//database error
                    _finishResponse(500, hooks[group_name][username], err_msg.db_err);
                }
                else
                {
                    connection.query(
                        "SELECT field, id FROM updates WHERE group_name = ? AND username = ?",
                        [group_name, username],
                        function(err, updates){
                            if(err)
                            {//database error
                                _finishResponse(500, hooks[group_name][username], err_msg.db_err);
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
                                    "SELECT field, data FROM group_data " +
                                        "WHERE group_name = ? AND " + "(" + query_fields + ") AND ? > CHAR_LENGTH(data);",
                                    [group_name, update_size_limits[group_name][username]],
                                    function(err, data_result)
                                    {
                                        if(err)
                                        {//database error
                                            _finishResponse(500, hooks[group_name][username], err_msg.db_err);
                                        }
                                        else
                                        {
                                            data = {};//object of field name : data pairs
                                            for(i = 0; i < data_result.length; i += 1)
                                            {
                                                data[data_result[i].field] = JSON.parse(data_result[i].data);
                                            }
                                            _finishResponse(200, hooks[group_name][username],
                                                {
                                                    updates: fields,
                                                    data: data,
                                                    clear: ids
                                                }
                                            );
                                        }
                                    }
                                )
                            }
                        }
                    );
                }
            }
        );
    }

    /**
     * Stores a client request until there are updates to notify of
     * @param username the requesting user's name
     * @param session the requesting user's current session key
     * @param group the group being listened to
     * @param clear array of update ids the user has acknowledged and can now be deleted from the database
     * @param limit maximum size in characters that the user would like to receive per field without specifically requesting data
     * @param response
     * @private
     */
    function _listenUpdate(username, session, group, clear, limit, response){
        if( typeof group !== 'string' || !_isJSON(clear) || !_isJSON(limit))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        clear = JSON.parse(clear);
        limit = JSON.parse(limit);
        if(!(clear instanceof Array) || typeof limit !== 'number')
        {//argument is wrong type
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        _checkCredentials(username, session, response, function(){
            connection.query(
                "SELECT 1 FROM groups WHERE group_name = ?;",
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
                }
            );
        });
    }

    /**
     * Compiles pending inputs and sends them to the waiting host client, if possible
     * @param group_name the group to retrieve input for
     * @param clear array of input ids that client acknowledges as recieved can now be deleted from database
     * @private
     */
    function _retrieveInput(group_name, clear)
    {
        connection.query(
            "SELECT host FROM groups WHERE group_name = ? LIMIT 1;",
            [group_name],
            function(err, host)
            {
                var i, clear_query;
                if(!hooks[group_name][host[0].host])
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
                    [group_name],
                    function(err)
                    {
                        if(err)
                        {//database error
                            _finishResponse(500, hooks[group_name][host[0].host], err_msg.db_err);
                        }
                        else
                        {
                            connection.query(
                                "SELECT username, input, time, id FROM inputs WHERE group_name = ?",
                                [group_name],
                                function(err, input)
                                {
                                    if(err)
                                    {//database error
                                        _finishResponse(500, hooks[group_name][host[0].host], err_msg.db_err);
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
                                                    username: input[i].username,
                                                    input: JSON.parse(input[i].input),
                                                    time: input[i].time
                                                });
                                            ids.push(input[i].id);
                                        }
                                        _finishResponse(200, hooks[group_name][host[0].host], {inputs: contents, clear: ids});
                                    }
                                }
                            );
                        }
                    }
                );
            }
        );
    }

    /**
     * Stores a client request until there are inputs to notify of
     * @param username the requesting user's name
     * @param session the requesting user's current session key
     * @param group_name the group being listened to
     * @param clear array of input ids the user has acknowledged and can now be deleted from the database
     * @param response
     * @private
     */
    function _listenInput(username, session, group_name, clear, response){
        if( typeof group_name !== 'string' || !_isJSON(clear))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        clear = JSON.parse(clear);
        if(!(clear instanceof Array))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        _checkCredentials(username, session, response, function(){
            _checkHost(username, group_name, response, function(){
                hooks[group_name][username] = response;
                _retrieveInput(group_name, clear);
            });
        });
    }

    /**
     * Sends a user's input to a group and notifies the host
     * @param username the calling user's username
     * @param session the calling user's current session key
     * @param group_name the group the input is being submitted to
     * @param input JSON string containing arbitrary input
     * @param response object for replying to client
     * @private
     */
    function _submitInput(username, session, group_name, input, response){
        if( typeof group_name !== 'string' || !_isJSON(input))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        _checkCredentials(username, session, response, function(){
            connection.query(
                "INSERT INTO inputs VALUES (?, ?, ?, ?, ?);",
                [group_name, username, input, new Date().getTime(), Math.random() * Number.MAX_VALUE],
                function(err){
                    if(err)
                    {//database error
                        _finishResponse(500, response, err_msg.db_err);
                    }
                    else {
                        _finishResponse(200, response, null);
                        _retrieveInput(group_name, []);
                    }
                });
        });
    }

    /**
     * Helper function to insert pre-calculated permission values to the database and notify affected members
     * @param group the group the permissions applyto
     * @param permitted_values string of value sets to insert into the permissions table
     * @param update_values string of value sets to insert into the updates table
     * @param updated_members array of user names who are affected by permission change
     * @param response object for replying to client
     * @private
     */
    function _insertPermissions(group, permitted_values, update_values, updated_members, response)
    {
        connection.query(
            "INSERT INTO permissions VALUES " + permitted_values + " ON DUPLICATE KEY UPDATE field = field",
            function(err)
            {
                if(err)
                {//database error
                    _finishResponse(500, response, err_msg.db_err);
                }
                else
                {
                    connection.query(
                        "INSERT INTO updates VALUES" + update_values +
                            " ON DUPLICATE KEY UPDATE time = VALUES(time);",
                        function(err)
                        {
                            if(err)
                            {//database error
                                _finishResponse(500, response, err_msg.db_err);
                            }
                            else
                            {
                                var i;
                                _finishResponse(200, response, null);
                                for (i = 0; i < updated_members.length; i += 1)
                                {//tell all affected members they have new updates
                                    _retrieveUpdates(updated_members[i], group, []);
                                }
                            }
                        }
                    );
                }
            }
        );
    }

    /**
     * Helper function that massages permissions parameters into a uniform format
     * @param field string or array of string specifying which data the permissions are for
     * @param member string or array of string specifying which users the permissions are for
     * @param permission bool or array of bool or array of array of bool specifying whether permission is granted or revoked
     * @param username username of calling user
     * @returns object containing formatted versions of params if successful, otherwise false
     * @private
     */
    function _formatPermissions(field, member, permission, username)
    {//returns false if failure, object containing formatted field, members, and permissions if success
        var i, j;
        //format the fields parameter into a single dimensional array of field names
        if(!_isJSON(field))
        {//if field isn't json, invalid argument
            return false;
        }
        field = JSON.parse(field);
        if(typeof field === 'string')
        {//turn single string field into a 1-element array
            field = [field];
        }
        else if(!(field instanceof Array) || field.length === 0)
        {//if not an array and not a string, or if array of length 0, invalid argument
            return false;
        }
        //format member into an array of names. if none present, array should contain host as sole element
        if(!member)
        { //set host as target member, which means universal permissions
            member = [username];
        }
        else if(_isJSON(member))
        {
            member = JSON.parse(member);
            if(typeof member === 'string')
            {//turn string into array
                member = [member];
            }
            else if(member instanceof Array)
            {
                for(i = 0; i < member.length; i +=1)
                {
                    if(typeof(member[i]) !== 'string')
                    {//must be either string or array of strings
                        return false;
                    }
                }
            }
            else
            {//must be either string or array of strings
                return false;
            }
        }
        else
        {//not the right type, cannot format
            return false;
        }
        //format permissions into 2-dimensional array of booleans
        if(!permission)
        {
            permission = JSON.stringify(true);
        }
        if(_isJSON(permission))
        {
            permission = JSON.parse(permission);
            if(typeof permission === 'boolean')
            {
                permission = [permission];
            }
            if(!(permission instanceof Array))
            {
                return false;
            }
            for(i = 0; i < field.length; i += 1)
            {
                if(permission[i] === undefined)
                {
                    permission[i] = permission[0];
                }
                if(typeof permission[i] === 'boolean')
                {
                    permission[i] = [permission[i]];
                }
                if(!(permission[i] instanceof Array))
                {
                    return false;
                }
                for(j = 0; j < member.length; j += 1)
                {
                    if(permission[i][j] === undefined)
                    {
                        permission[i][j] = permission[i][0];
                    }
                    if(typeof permission[i][j] !== 'boolean')
                    {
                        return false;
                    }
                }
            }
        }
        else
        {
            return false;
        }
        return {field: field, member: member, permission: permission};
    }

    /**
     * Grants or revokes read permissions to/from members of the group for given data fields
     * @param username the username of the calling user
     * @param session the calling user's current session key
     * @param group_name the group the permissions apply to
     * @param field string or array of string indicating the data fields the permissions apply to
     * @param member string or array of string indicating the members the permissions apply to
     * @param permission bool or array of bool or array of array of bool indicating whether permission is granted or revoked
     * @param response object for replying to client
     * @private
     */
    function _setPermission(username, session, group_name, field, member, permission, response)
    {
        _checkCredentials(username, session, response, function()
        {
            _checkHost(username, group_name, response, function()
            {//select all members other than host
                connection.query(
                    "SELECT username FROM members WHERE group_name = ? AND username != ?;",
                    [group_name, username],
                    function(err, result)
                {
                    if(err)
                    {//database error
                        _finishResponse(500, response, err_msg.db_err);
                    }
                    else
                    {
                        var i, group_members;
                        group_members = [];
                        for(i = 0; i < result.length; i +=1)
                        {
                            group_members.push(result[i].username);
                        }
                        var formatted = _formatPermissions(field, member, permission, username);
                        if(!formatted || typeof group_name !== 'string')
                        {
                            _finishResponse(400, response, err_msg.invalid_args);
                            return;
                        }
                        var j, k, granted_permissions, revoked_permissions, updates, members_to_notify, shared_fields;
                        granted_permissions = '';//values to be inserted into the permissions table
                        revoked_permissions = '';//values to be removed from the permissions table
                        updates = ''; //values to be inserted into the updates table
                        members_to_notify = [];//array of names of users who have new updates from this function call
                        for(i = 0; i < formatted.field.length; i +=1)
                        {//for each field
                            if(typeof(formatted.field[i]) !== 'string')
                            {//incorrect argument type
                                _finishResponse(400, response, err_msg.invalid_args);
                                return;
                            }
                            for(j = 0; j < formatted.member.length; j += 1)
                            {//for each member
                                if(formatted.permission[i][j])//granting permissions
                                {
                                    if(members_to_notify.indexOf(formatted.member[j]) === -1 &&
                                        formatted.member[j] !== username)
                                    { //add members[j] to notification list if not already in it
                                        members_to_notify.push(formatted.member[j]);
                                    }
                                    if(formatted.member[j] === username)
                                    {//permission is set for host; universal access, notify all members
                                        for(k = 0; k < group_members.length; k += 1)
                                        {
                                            if(members_to_notify.indexOf(group_members[k]) === -1)
                                            { //add members[j] to notification list if not already in it
                                                members_to_notify.push(group_members[k]);
                                            }
                                            updates += "(" +
                                                connection.escape(group_name) + ',' +
                                                connection.escape(group_members[k]) + ',' +
                                                connection.escape(formatted.field[i]) + ',' +
                                                new Date().getTime() + ',' +
                                                Math.random() * Number.MAX_VALUE + '),'
                                        }
                                    }
                                    shared_fields = "("
                                        + connection.escape(group_name) + ","
                                        + connection.escape(formatted.member[j]) + ","
                                        + connection.escape(formatted.field[i]);
                                    granted_permissions += shared_fields + "),";
                                    updates +=
                                        shared_fields + ',' +
                                            new Date().getTime() + ',' +
                                            Math.random() * Number.MAX_VALUE + "),";
                                }
                                else
                                {//revoking permission
                                    revoked_permissions +=
                                        "(field = " + connection.escape(formatted.field[i]) +
                                            " AND username = " + connection.escape(formatted.member[j]) + ") OR";
                                }
                            }
                        }
                        if(revoked_permissions)
                        {
                            revoked_permissions = revoked_permissions.slice(0, -2); //cut off trailing OR
                            connection.query(
                                "DELETE FROM permissions " +
                                    "WHERE group_name = ? " +
                                    "AND ( " + revoked_permissions + " );",
                                [group_name],
                                function(err)
                                {
                                    if(err)
                                    {//database error
                                        _finishResponse(500, response, err_msg.db_err);
                                    }
                                    else if(granted_permissions)
                                    {//new permissions were granted, so notify users
                                        granted_permissions = granted_permissions.slice(0, -1);//cut off trailing commas
                                        updates = updates.slice(0, -1);//cut off trailing commas
                                        _insertPermissions(group_name, granted_permissions, updates, members_to_notify, response);
                                    }
                                    else
                                    {
                                        _finishResponse(200, response, null);
                                    }
                                });
                        }
                        else if(granted_permissions)
                        {
                            granted_permissions = granted_permissions.slice(0, -1);
                            updates = updates.slice(0, -1);
                            _insertPermissions(group_name, granted_permissions, updates, members_to_notify, response);
                        }
                        else
                        {
                            _finishResponse(200, response, null);
                        }
                    }
                });
            });
        });
    }

    /**
     * Pushes new data to the server and notifies affected members of the group. Optionally sets permissions
     * @param username the username of the calling user
     * @param session the calling user's current session key
     * @param group_name the group the permissions apply to
     * @param field string or array of string indicating the data fields the permissions apply to
     * @param data arbitrary data or array thereof to store in the above fields
     * @param member string or array of string indicating the members the permissions apply to
     * @param permission bool or array of bool or array of array of bool indicating whether permission is granted or revoked
     * @param response object for replying to client
     * @private
     */
    function _submitUpdate(username, session, group_name, field, data, member, permission, response)
    {
        _checkCredentials(username, session, response, function()
        {
            _checkHost(username, group_name, response, function()
            {//select all members other than host
                connection.query(
                    "SELECT username FROM members WHERE group_name = ? AND username != ?;",
                    [group_name, username],
                    function(err, result)
                {
                    if(err)
                    {//database error
                        _finishResponse(500, response, err_msg.db_err);
                    }
                    else
                    {
                        var i, group_members, formatted;
                        group_members = [];
                        for(i = 0; i < result.length; i +=1)
                        {
                            group_members.push(result[i].username);
                        }
                        formatted = _formatPermissions(field, member, permission, username);
                        if(!formatted || typeof group_name !== 'string')
                        {
                            _finishResponse(400, response, err_msg.invalid_args);
                            return;
                        }
                        data = JSON.parse(data);
                        if(formatted.field.length === 1)
                        {//data should be interpreted as a single element if only one field
                            data = [data];
                        }
                        else if(!(data instanceof Array) || formatted.field.length !== data.length)
                        {//incorrect argument
                            _finishResponse(400, response, err_msg.invalid_args);
                            return;
                        }
                        var data_values, updated_fields;
                        data_values = '';
                        updated_fields = '';
                        for(i = 0; i < formatted.field.length; i += 1)
                        {
                            if(typeof(formatted.field[i]) !== 'string')
                            {//incorrect argument type
                                _finishResponse(400, response, err_msg.invalid_args);
                                return;
                            }
                            data_values += "("
                                + connection.escape(group_name) + ","
                                + connection.escape(formatted.field[i]) + ","
                                + connection.escape(JSON.stringify(data[i])) + ")";
                            updated_fields += "field = " + connection.escape(formatted.field[i]);
                            if(i < formatted.field.length -1)
                            {
                                data_values += ",";
                                updated_fields += " OR ";
                            }
                        }
                        connection.query(
                            "INSERT INTO group_data VALUES " +data_values+
                                " ON DUPLICATE KEY UPDATE data = VALUES(data);",
                            function(err)
                            {
                                if(err)
                                {//database error
                                    _finishResponse(500, response, err_msg.db_err);
                                }
                                else
                                {
                                    connection.query(
                                        "SELECT username, field FROM permissions " +
                                            "WHERE group_name = ? AND" + "(" + updated_fields + ");",
                                        [group_name],
                                        function(err, result)
                                        {
                                            if(err)
                                            {//database error
                                                _finishResponse(500, response, err_msg.db_err);
                                            }
                                            else
                                            {
                                                var j, updates, members_to_notify;
                                                updates = '';
                                                members_to_notify = [];
                                                for(i = 0; i < result.length; i += 1)
                                                {
                                                    if(members_to_notify.indexOf(result[i].username) === -1 &&
                                                        result[i].username !== username)
                                                    {
                                                        members_to_notify.push(result[i].username);
                                                    }
                                                    if(result[i].username === username)
                                                    {//permission is set for host; universal access, notify all members
                                                        for(j = 0; j < group_members.length; j += 1)
                                                        {
                                                            if(members_to_notify.indexOf(group_members[j]) === -1)
                                                            { //add members[j] to notification list if not already in it
                                                                members_to_notify.push(group_members[j]);
                                                            }
                                                            updates += "(" +
                                                                connection.escape(group_name) + ',' +
                                                                connection.escape(group_members[j]) + ',' +
                                                                connection.escape(result[i].field) + ',' +
                                                                new Date().getTime() + ',' +
                                                                Math.random() * Number.MAX_VALUE + '),'
                                                        }
                                                    }
                                                    updates += "("
                                                        + connection.escape(group_name) + ','
                                                        + connection.escape(result[i].username) + ','
                                                        + connection.escape(result[i].field) + ','
                                                        + new Date().getTime() + ','
                                                        + connection.escape(Math.random() * Number.MAX_VALUE) + '),';
                                                }
                                                if(updates)
                                                {
                                                    updates = updates.slice(0, -1);
                                                    connection.query("INSERT INTO updates VALUES " + updates +
                                                        'ON DUPLICATE KEY UPDATE time = VALUES(time);',
                                                        function(err)
                                                        {
                                                            if(err)
                                                            {//database error
                                                                _finishResponse(500, response, err_msg.db_err);
                                                            }
                                                            else
                                                            {
                                                                for(i = 0; i < members_to_notify.length; i += 1)
                                                                {
                                                                    _retrieveUpdates(members_to_notify[i], group_name, []);
                                                                }
                                                                if(permission)
                                                                {
                                                                    _setPermission(
                                                                        username,
                                                                        session,
                                                                        group_name,
                                                                        JSON.stringify(formatted.field),
                                                                        JSON.stringify(formatted.member),
                                                                        JSON.stringify(formatted.permission),
                                                                        response);
                                                                }
                                                                else
                                                                {
                                                                    _finishResponse(200, response, null);
                                                                }
                                                            }
                                                        });
                                                }
                                                else
                                                {
                                                    if(permission)
                                                    {
                                                        _setPermission(
                                                            username,
                                                            session,
                                                            group_name,
                                                            JSON.stringify(formatted.field),
                                                            JSON.stringify(formatted.member),
                                                            JSON.stringify(formatted.permission),
                                                            response);
                                                    }
                                                    else
                                                    {
                                                        _finishResponse(200, response, null);
                                                    }
                                                }
                                            }
                                        }
                                    );
                                }
                            }
                        );
                    }
                });
            });
        });
    }

    /**
     * Retrieves data from a Knecht group only if the calling user has permission to do so
     * @param username name of the calling user
     * @param session the calling user's current session key
     * @param group_name the name of the group the data belongs to
     * @param field field or fields requested
     * @param response object for replying to client
     * @private
     */
    function _getGroupData(username, session, group_name, field, response)
    {
        if( typeof group_name !== 'string' || !_isJSON(field))
        {//argument is wrong type
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        field = JSON.parse(field);
        if(typeof field === 'string')
        {//make field into an 1-element array if string
            field = [field];
        }
        else if(!(field instanceof Array) || field.length === 0)
        {//field must be an array of at least length 1
            _finishResponse(400, response, err_msg.invalid_args);
            return;
        }
        _checkCredentials(username, session, response, function(username)
        {
            var i, query_fields;
            query_fields = '';//fields to get data from
            for(i = 0; i < field.length; i += 1){
                if(typeof field[i] !== 'string')
                {//argument is of incorrect type
                    _finishResponse(400, response, err_msg.invalid_args);
                    return;
                }
                query_fields += "field = " + connection.escape(field[i]);
                if(i < field.length -1)
                {
                    query_fields += " OR ";
                }
            }
            connection.query("SELECT host FROM groups WHERE group_name = ? LIMIT 1;",
                [group_name],
                function(err, host)
                {
                    if(err)
                    {//database error
                        _finishResponse(500, response, err_msg.db_err);
                    }
                    else if(host.length === 0)
                    {//group doesn't exist
                        _finishResponse(404, response, err_msg.no_group);
                    }
                    else if(host[0].host === username)
                    {//if host is requesting data, skip checking permissions
                        connection.query("SELECT field, data FROM group_data WHERE group_name = ? AND " +
                            "(" + query_fields + ");",
                            [group_name],
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
                            "(username = ? OR username = ?) AND (" + query_fields + ");",
                            [group_name, username, host[0].host, username],
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
                                        connection.query("SELECT field, data FROM group_data " +
                                            " WHERE group_name = ? AND (" + permitted_fields + ");",
                                            [group_name],
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
                            }
                        );
                    }
                }
            );
        });
    }
    //endregion

    //endregion

    /**
     * Handles incoming requests by passing their query values to the appropriate function
     * @param request incoming request object sent by client
     * @param response automatically generated response object used to answer request
     * @private
     */
    function _processRequest( request, response )
    {
        var body = '';
        request.on( 'data', function( data )
        {//collect and concatenate all parts of the request body
            body += data;
        });
        request.on( 'end', function()
        {//once request has been fully received, parse and pass to appropriate function
            console.log(request.url);
            var parsed_url = url.parse( request.url, true );//parse the request url into pathname and query values
            switch( parsed_url.pathname )
            {//direct request to proper resource based on pathname
                case "/users":
                    switch( request.method )
                    {//direct request to proper function based on method
                        case "GET":
                            _getUsers(
                                parsed_url.query.constraints,
                                response );
                            break;
                        case "POST":
                            _register(
                                parsed_url.query.username,
                                body, //password
                                parsed_url.query.timeout,
                                response
                            );
                            break;
                        case "DELETE":
                            _unregister(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                response
                            );
                            break;
                        case "OPTIONS":
                            _respondOptions('PUT, DELETE, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.req_err);
                    }
                    break;
                case "/users/session":
                    switch(request.method)
                    {
                        case "PUT":
                            _login(
                                parsed_url.query.username,
                                body, //password
                                parsed_url.query.timeout,
                                response
                            );
                            break;
                        case "DELETE":
                            _logout(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                response);
                            break;
                        case "OPTIONS":
                            _respondOptions('PUT, DELETE, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.req_err);
                    }
                    break;
                case "/users/password":
                    switch(request.method)
                    {
                        case "GET":
                            _recoverPassword(
                                parsed_url.query.username,
                                response);
                            break;
                        case "PUT":
                            _changePassword(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                body, //password
                                response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, PUT, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.req_err);
                    }
                    break;
                case "/users/data":
                    switch(request.method)
                    {
                        case "PUT":
                            _putData(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                parsed_url.query.application,
                                parsed_url.query.field,
                                body, //data
                                response);
                            break;
                        case "GET":
                            _getData(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                parsed_url.query.application,
                                parsed_url.query.field,
                                response);
                            break;
                        case "DELETE":
                            _deleteData(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                parsed_url.query.application,
                                parsed_url.query.field,
                                response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, PUT, DELETE, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.req_err);
                    }
                    break;
                case "/groups":
                    switch(request.method)
                    {
                        case "POST":
                            _startGroup(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                parsed_url.query.group_name,
                                parsed_url.query.application,
                                response);
                            break;
                        case "GET":
                            _getGroups(
                                parsed_url.query.constraints,
                                response);
                            break;
                        case "DELETE":
                            _closeGroup(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                parsed_url.query.group_name,
                                response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, POST, DELETE, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.req_err);
                    }
                    break;
                case "/groups/members":
                    switch(request.method)
                    {
                        case "POST":
                            _addMember(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                parsed_url.query.group_name,
                                parsed_url.query.member,
                                response);
                            break;
                        case "DELETE":
                            _removeMember(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                parsed_url.query.group_name,
                                parsed_url.query.member,
                                response);
                            break;
                        case "OPTIONS":
                            _respondOptions('POST, DELETE, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.req_err);
                    }
                    break;
                case "/groups/data":
                    switch(request.method){
                        case "PUT":
                            _submitUpdate(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                parsed_url.query.group_name,
                                parsed_url.query.field,
                                body, //data
                                parsed_url.query.member,
                                parsed_url.query.permission,
                                response);
                            break;
                        case "GET":
                            _getGroupData(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                parsed_url.query.group_name,
                                parsed_url.query.field,
                                response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, PUT, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.req_err);
                    }
                    break;
                case "/groups/data/permissions":
                    switch(request.method){
                        case "PUT":
                            _setPermission(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                parsed_url.query.group_name,
                                parsed_url.query.field,
                                parsed_url.query.member,
                                parsed_url.query.permission,
                                response);
                            break;
                        case "OPTIONS":
                            _respondOptions('PUT, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.req_err);
                    }
                    break;
                case "/groups/updates":
                    switch(request.method){
                        case "GET":
                            _listenUpdate(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                parsed_url.query.group_name,
                                parsed_url.query.clear,
                                parsed_url.query.limit,
                                response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.req_err);
                    }
                    break;
                case "/groups/input":
                    switch(request.method){
                        case "POST":
                            _submitInput(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                parsed_url.query.group_name,
                                body, //input
                                response);
                            break;
                        case "GET":
                            _listenInput(
                                parsed_url.query.username,
                                parsed_url.query.session,
                                parsed_url.query.group_name,
                                parsed_url.query.clear,
                                response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, POST, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(400, response, err_msg.req_err);
                    }
                    break;
                default:
                    //requested resource is not in the Knecht API, respond error
                    _finishResponse ( 400, response, err_msg.req_err );
            }
        } );
    }

    //region Startup functions
    /**
     * recommended disconnect handler from https://github.com/felix/node-mysql/blob/master/Readme.md
     * connects to mysql database and attempts to automatically reconnect if connection lost
     * @private
     */
    function _connect()
    {
        connection = mysql.createConnection( db_config );
        connection.connect( function( err )
        { //open connection to the mysql database
            if( err )
            { //if connecting fails, try again after delay
                window.setTimeout( _connect, db_config.reconnect_delay );
            }
        });
        connection.on( 'error', function(err)
        { //reconnect automatically if disconnected, or throw error if other db error
            if( err.code === 'PROTOCOL_CONNECTION_LOST' )
            {
                _connect();
            }
            else
            {
                throw err;
            }
        } );
    }

    /**
     * Creates necessary database tables if they do not yet exist and sets Knecht database to active
     * @private
     */
    function _initDatabase()
    {
        _connect();//open a connection to the mysql database
        function _checkError( err )
        {//helper function to cut down on repeated code. Throws exception if error occurs during initialization
            if( err )
            {
                throw err;
            }
        }
        connection.query('DROP DATABASE IF EXISTS knecht', function(){ //TODO: remove in final version
        connection.query( 'CREATE DATABASE IF NOT EXISTS knecht;', function( err )
        {
            _checkError( err );
            connection.query( 'USE knecht;', function( err )
            {
                _checkError( err );
                //create table containing user IDs and authentication variables
                connection.query( 'CREATE TABLE IF NOT EXISTS users(' + //each entry represents a single knecht account
                    //name of the account
                    'username VARCHAR (' + db_config.column_length.username + '),' +
                    //password associated with account
                    'password VARCHAR (' + db_config.column_length.password + '),' +
                    //maximum time in minutes between requests before account's session expires
                    'timeout TINYINT,' +
                    //username + number generated randomly on login that identifies the active session for this account
                    'session VARCHAR (' + db_config.column_length.session + '),' +
                    //timestamp of the last request received from this account
                    'last_ping BIGINT,' +
                    //username must be unique among all entries
                    'PRIMARY KEY (username));',
                    function( err )
                    {
                        _checkError( err );
                        connection.query('CREATE TABLE IF NOT EXISTS user_data(' +
                            //the name of the account with which the entry is associated
                            'username VARCHAR (' + db_config.column_length.username + '),' +
                            //the application with which the entry is associated
                            'application VARCHAR (' + db_config.column_length.application + '),' +
                            //the name of the data field with which the entry is associated
                            'field VARCHAR (' + db_config.column_length.field + '),' +
                            //data value stored in the specified field
                            'data TEXT (' + db_config.column_length.data + '),' +
                            //combination of user, app, and field must be unique among all entries
                            'PRIMARY KEY (username, application, field),' +
                            //user field must correspond to a registered user
                            'FOREIGN KEY (username) REFERENCES users (username)' +
                            //entries will be deleted or updated as the associated user is deleted or renamed
                            'ON DELETE CASCADE ON UPDATE CASCADE);',
                            _checkError);
                        connection.query('CREATE TABLE IF NOT EXISTS groups(' +
                            //the name of the group with which the entry is associated
                            'group_name VARCHAR (' + db_config.column_length.group_name + '),' +
                            //the name off the application the group is for
                            'application VARCHAR (' + db_config.column_length.application + '),' +
                            //the name of the account that started the group
                            'host VARCHAR (' + db_config.column_length.username + '),' +
                            //group name must be unique among all entries
                            'PRIMARY KEY (group_name),' +
                            //host field must correspond to a registered user
                            'FOREIGN KEY (host) REFERENCES users (username)' +
                            //entries will be deleted or updated as the host user is deleted or renamed
                            'ON DELETE CASCADE ON UPDATE CASCADE);',
                            function( err )
                            {
                                _checkError( err );
                                //create table of group member entries
                                connection.query('CREATE TABLE IF NOT EXISTS members(' +
                                    //name of the group the entry is associated with
                                    'group_name VARCHAR (' + db_config.column_length.group_name + '),' +
                                    //name of the user the entry is associated with
                                    'username VARCHAR (' + db_config.column_length.username + '),' +
                                    //combination of group name and username must be unique among all entries
                                    'PRIMARY KEY (group_name, username),' +
                                    //user field must correspond to a registered user
                                    'FOREIGN KEY (username) REFERENCES users (username)' +
                                    //entries will be deleted or updated as the associated user is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE,' +
                                    //group_name field must correspond to a registered group
                                    'FOREIGN KEY (group_name) REFERENCES groups (group_name)' +
                                    //entries will be deleted or updated as the associated group is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE);',
                                    _checkError);
                                //create table of shared data entries
                                connection.query('CREATE TABLE IF NOT EXISTS group_data(' +
                                    //name of the group the entry is associated with
                                    'group_name VARCHAR (' + db_config.column_length.group_name + '),' +
                                    //name of the data field the entry is associated with
                                    'field VARCHAR (' + db_config.column_length.field + '),' +
                                    //data value stored in the specified field
                                    'data TEXT (' + db_config.column_length.data + '),' +
                                    //combination of group_name and field must be unique among all entries
                                    'PRIMARY KEY (group_name, field),' +
                                    //group_name must correspond to a registered group
                                    'FOREIGN KEY (group_name) REFERENCES groups(group_name)' +
                                    //entries will be deleted or updated as the associated group is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE);',
                                    _checkError);
                                //create table of pending updates
                                connection.query('CREATE TABLE IF NOT EXISTS updates(' +
                                    //name of the group the notification is for
                                    'group_name VARCHAR (' + db_config.column_length.group_name + '),' +
                                    //name of the user the notification is for
                                    'username VARCHAR (' + db_config.column_length.username + '),' +
                                    //name of the data field that has been updated
                                    'field VARCHAR (' + db_config.column_length.field + '),' +
                                    //timestamp off when the update occurred
                                    'time BIGINT,' +
                                    //random number to distinguish this update from others for garbage cleaning
                                    'id VARCHAR (' + db_config.column_length.session + '),' +
                                    //combination of group_name, user, and field must be unique among all entries
                                    'PRIMARY KEY (group_name, username, field),' +
                                    //user must correspond to a registered user
                                    'FOREIGN KEY (username) REFERENCES users (username)' +
                                    //entries will be deleted or updated as the associated user is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE,' +
                                    //group_name must correspond to a registered group
                                    'FOREIGN KEY (group_name) REFERENCES groups(group_name)' +
                                    //entries will be deleted or updated as the associated group is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE);',
                                    _checkError);
                                //create table of entries defining a whitelist of who can access group data fields
                                connection.query('CREATE TABLE IF NOT EXISTS permissions(' +
                                    //name of the group the permission is for
                                    'group_name VARCHAR (' + db_config.column_length.group_name + '),' +
                                    //name of the user granted permissions. If this field is host, all users can access
                                    'username VARCHAR (' + db_config.column_length.username + '),' +
                                    //field the permission is for
                                    'field VARCHAR (' + db_config.column_length.field + '),' +
                                    //combination of group_name, user, and field must be unique among all entries
                                    'PRIMARY KEY (group_name, username, field),' +
                                    //user must correspond to a registered user
                                    'FOREIGN KEY (username) REFERENCES users (username)' +
                                    //entries will be deleted or updated as the associated user is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE,' +
                                    //user must correspond to a registered group
                                    'FOREIGN KEY (group_name) REFERENCES groups (group_name)' +
                                    //entries will be deleted or updated as the associated group is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE);',
                                    _checkError);
                                //create table of pending inputs
                                connection.query('CREATE TABLE IF NOT EXISTS inputs(' +
                                    //name of the group the input is for
                                    'group_name VARCHAR (' + db_config.column_length.group_name + '),' +
                                    //name of the user the input is from
                                    'username VARCHAR (' + db_config.column_length.username + '),' +
                                    //input value associated with the entry
                                    'input TEXT (' + db_config.column_length.data + '),' +
                                    //timestamp of when the input was received by the server
                                    'time BIGINT,' +
                                    //random number to distinguish this input from others for garbage cleaning
                                    'id VARCHAR (' + db_config.column_length.session + '),' +
                                    //user must correspond to a registered user
                                    'FOREIGN KEY (username) REFERENCES users (username)' +
                                    //entries will be deleted or updated as the associated user is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE,' +
                                    //user must correspond to a registered group
                                    'FOREIGN KEY (group_name) REFERENCES groups(group_name)' +
                                    //entries will be deleted or updated as the associated group is deleted or renamed
                                    'ON DELETE CASCADE ON UPDATE CASCADE);',
                                    _checkError);
                            }
                        );
                    }
                );
            } );
        } ); }); //TODO remove this last close bracket
    }
    //endregion

    //region Startup calls
    _initDatabase();//connect to the database and ensure that it is configured to store Knecht data
    http.createServer( _processRequest ).listen( port );
    //endregion
} () );
