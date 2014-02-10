var K = {};
var port = 8080;

(function(){
    //region Constants
    var db_config = {
        host: "localhost",
        user: "root",
        password:"V3n3diggM",
        delay: 2000
    };

    var db_field_size = {
        email: 255,
        password: 32,
        app: 64,
        field: 64,
        data: 0xffffff,
        groupname: 128,
        input: 0xffffff,
        time: 64,
        session_id: 320
    };

    K.OK = 200;
    K.UNAUTH = 401;
    K.INVALID = 403;
    K.ERROR = 500;

    //endregion

    //region Globals
    var mysql = require("mysql");
    var url = require("url");
    var http = require("http");

    var connection;
    var hooks = {};
    //endregion

    //region Initialization
    _connect();
    console.log("dropping db for clean testing. Remove this in final version");
    connection.query("DROP DATABASE IF EXISTS knecht");
    _initDatabase();
    K.server = http.createServer(_processRequest);
    //endregion

    //region Users Functions

    /**
     * Checks if the given email is registered on this server
     * @param email
     * @param response
     * @responds K.ERROR if there is an error with the query
     * @responds K.INVALID if email is not registered
     * @responds K.OK if email is registered
     */
    function _checkUser(email, response){
        connection.query("SELECT 1 FROM users WHERE email = ? LIMIT 1;", [email], function(err, result){
            if(err) _finishResponse(K.ERROR, response);
            else if(result.length === 0) _finishResponse(K.INVALID, response);
            else _finishResponse(K.OK, response);
        });
    }

    /**
     * Registers a new user on the server
     * @param email
     * @param password
     * @param timeout the length of time a session token for this account will remain valid, in minutes
     * @param response
     * @responds K.ERROR if there is an error with the query
     * @responds K.INVALID if the email is already registered
     * @responds K.OK if successful, providing session id in body
     */
    function _register(email, password, timeout, response){
        var session_id = _generateSessionID(email);
        connection.query("INSERT INTO users VALUES (?, ?, ?, ?, ?);",
            [email, password, timeout, session_id, _getTime()], function(err){
            if(err) {
                if(err.code == "ER_DUP_ENTRY") _finishResponse(K.INVALID, response);
                else _finishResponse(K.ERROR, response);
            }
            else _finishResponse(K.OK, response, session_id);
        });
    }

    /**
     * Logs a user into the server, generating a new session id and invalidating the previous one
     * @param email
     * @param password
     * @param response
     * @responds K.ERROR if there is an error with a query
     * @responds K.INVALID if the email is not registered
     * @responds K.UNAUTH if the password does not match the email
     * @responds K.OK if successful, providing session id in body
     */
    function _login(email, password, response){
        connection.query("SELECT password FROM users WHERE email = ? LIMIT 1;", [email], function(err, result){
            if(err) _finishResponse(K.ERROR, response);
            else if(result.length === 0) _finishResponse(K.INVALID, response);
            else if(result[0].password !== password) _finishResponse(K.UNAUTH, response);
            else {
                var session_id = _generateSessionID(email);
                connection.query("UPDATE users SET session_id = ?, lastping = ? WHERE email = ? LIMIT 1;",
                    [session_id, _getTime(), email], function(err){
                    if(err) _finishResponse(K.ERROR, response);
                    else _finishResponse(K.OK, response, session_id);
                });
            }

        });
    }

    /**
     * Sends an email containing a registered user's password to the registered email
     * @param email
     * @param response
     * @responds K.ERROR if there is an error with the query
     * @responds K.INVALID if the email is not registered
     * @responds K.OK if successful. No guarantee that the email has actually been recieved, only sent
     */
    function _recoverPassword(email, response){
        connection.query("SELECT 1 FROM users WHERE email = ?;", [email], function(err, result){
            if(err) _finishResponse(K.ERROR, response);
            else if(result === 0) _finishResponse(K.INVALID, response);
            else {
                //TODO: send recovery email
                _finishResponse(K.OK, response);
            }
        });
    }

    /**
     * Updates the password of a registered account
     * @param session
     * @param password the new password for this account
     * @param response
     * @responds K.ERROR if there is an error with the query
     * @responds K.INVALID if the session id does not exist in the database
     * @responds K.UNAUTH if the session id is expired
     * @respond K.OK if successful
     */
    function _changePassword(session_id, password, response){
        _checkCredentials(session_id, response, function(email){
            connection.query("UPDATE users SET password = ? WHERE email = ? LIMIT 1;", [password, email], function(err){
                if(err) _finishResponse(K.ERROR, response);
                else _finishResponse(K.OK, response);
            });
        });
    }

    /**
     * Removes a user and all their data from the server
     * @param session
     * @param response
     * @responds K.ERROR if there is an error with the queries
     * @responds K.INVALID if the session id does not exist in the database
     * @responds K.UNAUTH if the session id is expired
     * @responds K.OK if successful
     */
    function _unregister(session_id, response){
        _checkCredentials(session_id, response, function(email){
            connection.query("SELECT name FROM groups WHERE host = ?;", [email], function(err, result){
                if(err) _finishResponse(K.ERROR, response);
                else connection.query("DELETE FROM users WHERE email = ? LIMIT 1;", [email], function(err){
                    if(err) _finishResponse(K.ERROR, response);
                    else {
                        _finishResponse(K.OK, response);
                        for(var i; i < result.length; i++) {
                            for(var member in hooks[result[i].name])
                                if (hooks[result[i].name].hasOwnProperty(member))
                                    _finishResponse(K.OK, hooks[result[i].name][member]);
                            delete hooks[result[i].name];
                        }
                    }
                });
            });
        });
    }

    /**
     * Generates a unique key corresponding to a registered account, to be used as credentials for other functions
     * @param email
     * @returns concatenation of the email and a random number between 0 and 1
     */
    function _generateSessionID(email){
        return email + Math.random();
    }
    //endregion

    //region Users Data functions

    /**
     * Updates the given field for a user's app with the given data, or makes a new entry if it does not yet exist
     * @param session_id
     * @param app
     * @param field
     * @param data
     * @param response
     * @responds K.ERROR if there is an error with the queries
     * @responds K.INVALID if the session id does not exist in the database
     * @responds K.UNAUTH if the session id is expired
     * @responds K.OK if successful
     */
    function _putData(session_id, app, field, data, response){
        _checkCredentials(session_id, response, function(email){
            connection.query("INSERT INTO user_data VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = ?;",
                [email, app, field, data, data], function(err){
                    if(err) _finishResponse(K.ERROR, response);
                    else _finishResponse(K.OK, response);
                });
        });
    }

    /**
     * Retrieves an entry from a user's personal application data
     * @param session_id
     * @param app
     * @param field
     * @param response
     * @responds K.ERROR if there is an error with the queries
     * @responds K.INVALID if the session id or specified field does not exist in the database
     * @responds K.UNAUTH if the session id is expired
     * @responds K.OK if successful, with retrieved data in body
     */
    function _getData(session_id, app, field, response){
        _checkCredentials(session_id, response, function(email){
            connection.query("SELECT data FROM user_data WHERE user = ? AND app = ? AND field = ? LIMIT 1;",
                [email, app, field], function(err, result){
                    if(err) _finishResponse(K.ERROR, response);
                    else if (result.length === 0) _finishResponse(K.INVALID, response);
                    else _finishResponse(K.OK, response, result[0].data);
                });
        });
    }

    /**
     * Deletes an entry from a user's personal application data
     * @param session_id
     * @param app
     * @param field
     * @param response
     * @responds K.ERROR if there is an error with the queries
     * @responds K.INVALID if the session id does not exist in the database
     * @responds K.UNAUTH if the session id is expired
     * @responds K.OK if successful
     */
    function _deleteData(session_id, app, field, response){
        _checkCredentials(session_id, response, function(email){
            connection.query("DELETE FROM user_data WHERE user = ? AND app = ? AND field = ? LIMIT 1;",
                [email, app, field], function(err){
                    if(err) _finishResponse(K.ERROR, response);
                    else _finishResponse(K.OK, response);
                });
        });
    }
    //endregion

    //region Groups functions
    //region Host functions
    /**
     * Opens a multi-user group with requesting user as host
     * @param session_id
     * @param name
     * @param app
     * @param password
     * @param response
     * @responds K.ERROR if there is an error with the queries
     * @responds K.INVALID if the session id does not exist in the database or if group name is already in use
     * @responds K.UNAUTH if the session id is expired
     * @responds K.OK if successful
     */
    function _startGroup(session_id, name, app, password, response){
        _checkCredentials(session_id, response, function(email){
            connection.query("INSERT INTO groups VALUES (?, ?, ?, ?);",
                [name, app, password, email], function(err){
                    if(err) {
                        if(err.code == "ER_DUP_ENTRY") _finishResponse(K.INVALID, response);
                        else _finishResponse(K.ERROR, response);
                    }
                    else {
                        hooks[name] = {};
                        _finishResponse(K.OK, response);
                    }
                });
        });
    }

    /**
     * Closes a specified group and deletes all its data
     * @param session_id
     * @param group
     * @param response
     * @responds K.ERROR if there is an error with the queries
     * @responds K.INVALID if the session id does not exist in the database
     * @responds K.UNAUTH if the session id is expired or if requesting user is not host
     * @responds K.OK if successful
     */
    function _closeGroup(session_id, group, response){
        console.log("closing group");
        _checkCredentials(session_id, response, function(email){
            _checkHost(email, group, response, function(){
                connection.query("DELETE FROM groups WHERE name = ? LIMIT 1;", [group], function(err){
                    if(err) _finishResponse(K.ERROR, response);
                    else {
                        _finishResponse(K.OK, response);
                        for(var member in hooks[group])
                            if (hooks[group].hasOwnProperty(member))
                                _finishResponse(K.OK, hooks[group][member]);
                        delete hooks[group];
                    }
                });
            });
        });
    }

    /**
     * Adds a user to a group, allowing them to receive updates posted by the host
     * @param session_id
     * @param group
     * @param member
     * @param response
     * @responds K.ERROR if there is an error with the queries
     * @responds K.INVALID if the session id or group do not exist in the database
     * @responds K.UNAUTH if the session id is expired or if requesting user is not host
     * @responds K.OK if successful
     */
    function _addMember(session_id, group, member, response){
        _checkCredentials(session_id, response, function(email){
            _checkHost(email, group, response, function(){
                connection.query("INSERT INTO members VALUES (?, ?);", [group, member], function(err){
                    if(err) {
                        if(err.code == "ER_DUP_ENTRY") _finishResponse(K.INVALID, response);
                        else _finishResponse(K.ERROR, response, err.toString());
                    }
                    else _finishResponse(K.OK, response);
                });
            });
        });
    }

    /**
     * Removes a user from a group. If removed user is host, closes group instead
     * @param session_id
     * @param group
     * @param member
     * @param response
     * @responds K.ERROR if there is an error with the queries
     * @responds K.INVALID if the session id or group do not exist in the database or user is not a member of group
     * @responds K.UNAUTH if the session id is expired or if requesting user is not host
     * @responds K.OK if successful
     */
    function _removeMember(session_id, group, member, response){
        _checkCredentials(session_id, response, function(email){
            _checkHost(email, group, response, function(){
                if(email === member) _closeGroup(session_id, group, response);
                else connection.query("SELECT 1 FROM members WHERE groupname = ? AND user = ? LIMIT 1;",
                    [group, member], function(err, result){
                        if(err) _finishResponse(K.ERROR, response);
                        else if(result.length === 0) _finishResponse(K.INVALID, response);
                        else {
                            if(hooks[group][member]) _finishResponse(K.OK, hooks[group][member]);
                            connection.query("DELETE FROM members WHERE groupname = ? AND user = ? LIMIT 1;",
                                [group, member], function(err){
                                    if(err) _finishResponse(K.ERROR, response);
                                    else connection.query("DELETE FROM inputs WHERE groupname = ? AND user = ?;",
                                        [group, member], function(err){
                                            if(err) _finishResponse(K.ERROR, response);
                                            else connection.query("DELETE FROM updates WHERE groupname = ? AND user = ?;",
                                                [group, member], function(err){
                                                    if(err) _finishResponse(K.ERROR, response);
                                                    else connection.query("DELETE FROM inputs WHERE groupname = ? AND user = ?;",
                                                        [group, member], function(err){
                                                            if(err) _finishResponse(K.ERROR, response);
                                                            else _finishResponse(K.OK, response);
                                                        });
                                                });
                                        });
                                });
                        }
                    });
            });
        });
    }

    function _submitUpdate(session_id, group, field, data, response){ //TODO: optionally set permissions
        _checkCredentials(session_id, response, function(email){
            _checkHost(email, group, response, function(){
                connection.query("INSERT INTO group_data VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = ?;",
                    [group, field, data, new Date().getTime(), data], function(err){
                        if(err) _finishResponse(K.ERROR, response, err.toString());
                        else {
                            connection.query("SELECT user FROM permissions WHERE groupname = ? AND field = ?;",
                                [group, field], function(err, permissions){
                                    if(err) _finishResponse(K.ERROR, response, err.toString());
                                    else{
                                        var values = '';
                                        for(var i = 0; i < permissions.length; i++){
                                            values += "("
                                                + connection.escape(group) + ","
                                                + connection.escape(permissions[i].user) + ","
                                                + connection.escape(field) + ","
                                                + new Date().getTime() + ")";
                                            if(i < permissions.length -1) values += ",";
                                            else values += ";";
                                        }
                                        if(values !== '') connection.query("INSERT INTO updates VALUES" + values, function(err){
                                            if(err) _finishResponse(K.ERROR, response, err.toString());
                                            else {
                                                _finishResponse(K.OK, response);
                                                for (var i = 0; i < permissions.length; i++)
                                                    _retrieveUpdates(permissions[i].user, group, 0);
                                            }
                                        });
                                        else _finishResponse(K.OK, response);
                                    }
                                });
                        }
                    });
            });
        });
    }

    function _listenInputs(session_id, group, timestamp, response){
        _checkCredentials(session_id, response, function(email){
            _checkHost(email, group, response, function(){
                hooks[group][email] = response;
                _retrieveInput(group, timestamp);
            });
        });
    }

    function _retrieveInput(group, timestamp){
        connection.query("SELECT host FROM groups WHERE name = ? LIMIT 1;", [group], function(err, host){
            connection.query("SELECT user, input, time FROM inputs WHERE groupname = ?", [group], function(err, input){
                if(err) _finishResponse(K.ERROR, hooks[group][host[0].host], err.toString());
                else if(input.length > 0) {
                    var contents = [];
                    for(var i = 0; i < input.length; i++) {
                        contents.push({user: input[i].user, input: input[i].input, time: input[i].time});
                        connection.query("DELETE FROM inputs WHERE groupname = ? AND user = ? AND input = ? AND time < ? LIMIT 1;",
                            [group, input[i].user, input[i].input, timestamp]);
                    }
                    _finishResponse(K.OK, hooks[group][host[0].host], contents);
                }
            });
        });
    }

    function _grantPermission(session_id, group, member, field, response){
        _checkCredentials(session_id, response, function(email){
            _checkHost(email, group, response, function(){
                connection.query("INSERT INTO permissions VALUES (?, ?, ?);", [group, member, field], function(err){
                    if(err) _finishResponse(K.ERROR, response, err.toString());
                    else _finishResponse(K.OK);
                });
            });
        });
    }

    function _revokePermission(session_id, group, member, field, response){
        _checkCredentials(session_id, response, function(email){
            _checkHost(email, group, response, function(){
                connection.query("DELETE FROM permissions WHERE groupname = ? AND user = ? AND field = ?;",
                    [group, member, field], function(err){
                        if(err) _finishResponse(K.ERROR, response, err.toString());
                        else _finishResponse(K.OK);
                    });
            });
        });
    }

    function _checkHost(email, group, response, callback){
        connection.query("SELECT host FROM groups WHERE name = ? LIMIT 1;", [group], function(err, result){
            if(err) _finishResponse(K.ERROR, response, err.toString());
            else if (result.length === 0) _finishResponse(K.INVALID, response);
            else if(result[0].host !== email) _finishResponse(K.UNAUTH, response);
            else callback();
        });
    }
    //endregion

    //region Member functions
    function _submitInput(session_id, group, input, response){
        _checkCredentials(session_id, response, function(email){
            connection.query("INSERT INTO inputs VALUES (?, ?, ?, ?);", [group, email, input, new Date().getTime()], function(err){
                if(err) _finishResponse(K.ERROR, response, err.toString());
                else {
                    _finishResponse(K.OK, response);
                    _retrieveInput(group, 0);
                }
            });
        });
    }

    function _listenUpdates(session_id, group, timestamp, response){
        _checkCredentials(session_id, response, function(email){
            connection.query("SELECT 1 FROM members WHERE groupname = ? AND user = ?;",
                [group, email], function(err, result){
                    if(err) _finishResponse(K.ERROR, response, err.toString());
                    else if(result.length === 0) _finishResponse(K.INVALID, response);
                    else {
                        hooks[group][email] = response;
                        _retrieveUpdates(email, group, timestamp);
                    }
                });
        });
    }

    function _retrieveUpdates(email, group, timestamp){
        connection.query("SELECT field FROM updates WHERE groupname = ? AND user = ?", [group, email], function(err, updates){
            if(err) _finishResponse(K.ERROR, hooks[group][email], err.toString());
            else if(updates.length > 0) {
                var contents = [];
                for(var i = 0; i < updates.length; i++) {
                    contents.push(updates[i].field);
                    connection.query("DELETE FROM updates WHERE groupname = ? AND user = ? AND time < ?;", [group, updates[i].user, timestamp]);
                }
                _finishResponse(K.OK, hooks[group][email], contents);
            }
        });
    }
    //endregion

    function _getGroupData(session_id, group, field, response){
        _checkCredentials(session_id, response, function(email){
            var permitted = false;
            connection.query("(SELECT 1 FROM permissions WHERE groupname = ? AND user = ? AND field = ? LIMIT 1) UNION" +
                "(SELECT 1 FROM groups WHERE name = ? AND host = ?);",
                [group, email, field, group, email], function(err, result){
                    console.log(result);
                    if(err) _finishResponse(K.ERROR, response, err.toString());
                    else if(result.length === 0) _finishResponse(K.UNAUTH, response);
                    else connection.query("SELECT data FROM group_data WHERE groupname = ? AND field = ? LIMIT 1;",
                            [group, field], function(err, result){
                                if(err) _finishResponse(K.ERROR, response, err.toString());
                                else if(result.length === 0) _finishResponse(K.INVALID, response);
                                else _finishResponse(K.OK, response, result[0].data);
                            });
                });
        });
    }

    function _listGroups(app, response){
        connection.query("SELECT name FROM groups WHERE app = ?;", [app], function(err, result){
            if(err) _finishResponse(K.ERROR, response, err.toString());
            else{
                var group_list = [];
                for(var i = 0; i < result.length; i++) group_list.push(result[i].name);
                _finishResponse(K.OK, response, group_list);
            }
        });
    }

    function _listMembers(group, response){
        connection.query("SELECT host FROM groups WHERE name = ? LIMIT 1;", [group], function(err, result){
            if(err) _finishResponse(K.ERROR, response, err.toString());
            else if(result.length === 0) _finishResponse(K.INVALID, response);
            else {
                var content = {host: result[0].host, members: []};
                connection.query("SELECT user FROM members WHERE groupname = ?;", [group], function(err, result){
                    if(err) _finishResponse(K.ERROR, response, err.toString());
                    else {
                        for(var i = 0; i < result.length; i++) content.members.push(result[i].user);
                        _finishResponse(K.OK, response, content);
                    }
                });
            }
        });
    }

    //endregion

    function _connect(){ //recommended disconnect handling method from https://github.com/felix/node-mysql/blob/master/Readme.md
        connection = mysql.createConnection(db_config);
        connection.connect(function(err){
            if(err) setTimeout(_connect, db_config.delay);
        });
        connection.on("error", function(err){
            if(err.code === "PROTOCOL_CONNECTION_LOST") _connect();
            else throw err;
        });
    }

    function _initDatabase(){
        connection.query("CREATE DATABASE IF NOT EXISTS knecht;", function(err){
            if(err) throw err;
        });
        connection.query("USE knecht", function(err){
            if(err) throw err;
        });
        connection.query("CREATE TABLE IF NOT EXISTS users(" +
            "email VARCHAR (" + db_field_size.email + ")," +
            "password VARCHAR (" + db_field_size.password + ")," +
            "timeout VARCHAR (" + db_field_size.time + ")," +
            "session_id VARCHAR (" + db_field_size.session_id + ")," +
            "lastping VARCHAR (" + db_field_size.time + ")," +
            "PRIMARY KEY (email));",
            function(err){
                if(err) throw err;
            });
        connection.query("CREATE TABLE IF NOT EXISTS user_data(" +
            "user VARCHAR (" + db_field_size.email + ")," +
            "app VARCHAR (" + db_field_size.app + ")," +
            "field VARCHAR (" + db_field_size.field + ")," +
            "data TEXT (" + db_field_size.data + ")," +
            "PRIMARY KEY (user, app, field)," +
            "FOREIGN KEY (user) REFERENCES users (email) ON DELETE CASCADE ON UPDATE CASCADE);",
            function(err){
                if(err) throw err;
            });
        connection.query("CREATE TABLE IF NOT EXISTS groups(" +
            "name VARCHAR (" + db_field_size.groupname + ")," +
            "app VARCHAR (" + db_field_size.app + ")," +
            "password VARCHAR (" + db_field_size.password + ")," +
            "host VARCHAR (" + db_field_size.email + ")," +
            "PRIMARY KEY (name)," +
            "FOREIGN KEY (host) REFERENCES users (email) ON DELETE CASCADE ON UPDATE CASCADE);",
            function(err){
                if(err) throw err;
            });
        connection.query("CREATE TABLE IF NOT EXISTS inputs(" +
            "groupname VARCHAR (" + db_field_size.groupname + ")," +
            "user VARCHAR (" + db_field_size.email + ")," +
            "input TEXT (" + db_field_size.input + ")," +
            "time VARCHAR (" + db_field_size.time + ")," +
            "FOREIGN KEY (user) REFERENCES users (email) ON DELETE CASCADE ON UPDATE CASCADE," +
            "FOREIGN KEY (groupname) REFERENCES groups (name) ON DELETE CASCADE ON UPDATE CASCADE);",
            function(err){
                if(err) throw err;
            });
        connection.query("CREATE TABLE IF NOT EXISTS permissions(" +
            "groupname VARCHAR (" + db_field_size.groupname + ")," +
            "user VARCHAR (" + db_field_size.email + ")," +
            "field VARCHAR (" + db_field_size.field + ")," +
            "PRIMARY KEY (groupname, user, field)," +
            "FOREIGN KEY (user) REFERENCES users (email) ON DELETE CASCADE ON UPDATE CASCADE," +
            "FOREIGN KEY (groupname) REFERENCES groups (name) ON DELETE CASCADE ON UPDATE CASCADE);",
            function(err){
                if(err) throw err;
            });
        connection.query("CREATE TABLE IF NOT EXISTS updates(" +
            "groupname VARCHAR (" + db_field_size.groupname + ")," +
            "user VARCHAR (" + db_field_size.email + ")," +
            "field VARCHAR (" + db_field_size.field + ")," +
            "time VARCHAR (" + db_field_size.time + ")," +
            "PRIMARY KEY (groupname, user, field)," +
            "FOREIGN KEY (user) REFERENCES users (email) ON DELETE CASCADE ON UPDATE CASCADE," +
            "FOREIGN KEY (groupname) REFERENCES groups (name) ON DELETE CASCADE ON UPDATE CASCADE);",
            function(err){
                if(err) throw err;
            });
        connection.query("CREATE TABLE IF NOT EXISTS group_data(" +
            "groupname VARCHAR (" + db_field_size.groupname + ")," +
            "field VARCHAR (" + db_field_size.field + ")," +
            "data TEXT (" + db_field_size.data + ")," +
            "PRIMARY KEY (groupname, field)," +
            "FOREIGN KEY (groupname) REFERENCES groups (name) ON DELETE CASCADE ON UPDATE CASCADE);",
            function(err){
                if(err) throw err;
            });
        connection.query("CREATE TABLE IF NOT EXISTS members(" +
            "groupname VARCHAR (" + db_field_size.groupname + ")," +
            "user VARCHAR (" + db_field_size.email + ")," +
            "PRIMARY KEY (groupname, user)," +
            "FOREIGN KEY (user) REFERENCES users (email) ON DELETE CASCADE ON UPDATE CASCADE," +
            "FOREIGN KEY (groupname) REFERENCES groups (name) ON DELETE CASCADE ON UPDATE CASCADE);",
            function(err){
                if(err) throw err;
            });
    }

    function _processRequest(request, response){
        var data = "";
        request.on("data", function(chunk){
            data += chunk;
        });
        request.on("end", function(){
            var parsed_url = url.parse(request.url, true);
            switch(parsed_url.pathname){
                case "/users":
                    switch(request.method){
                        case "GET":
                            _checkUser(
                                parsed_url.query.email,
                                response);
                            break;
                        case "POST":
                            _register(
                                parsed_url.query.email,
                                JSON.parse(data),
                                parsed_url.query.timeout,
                                response);
                            break;
                        case "PUT":
                            _login(
                                parsed_url.query.email,
                                JSON.parse(data),
                                response);
                            break;
                        case "DELETE":
                            _unregister(
                                parsed_url.query.session_id,
                                response);
                            break;
                        default:
                            _finishResponse(501, response);
                    }
                    break;
                case "/users/password":
                    switch(request.method){
                        case "GET":
                            _recoverPassword(
                                parsed_url.query.email,
                                response);
                            break;
                        case "PUT":
                            _changePassword(
                                parsed_url.query.session_id,
                                JSON.parse(data),
                                response);
                            break;
                        default:
                            _finishResponse(501, response);
                    }
                    break;
                case "/users/data":
                    switch(request.method){
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
                        default:
                            _finishResponse(501, response);
                    }
                    break;
                case "/groups":
                    switch(request.method){
                        case "POST":
                            _startGroup(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.app,
                                JSON.parse(data),
                                response);
                            break;
                        case "GET":
                            _listGroups(
                                decodeURIComponent(parsed_url.query.app),
                                response);
                            break;
                        case "DELETE":
                            _closeGroup(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                response);
                            break;
                        default:
                            _finishResponse(501, response);
                    }
                    break;
                case "/groups/members":
                    switch(request.method){
                        case "POST":
                            _addMember(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.email,
                                response);
                            break;
                        case "GET":
                            _listMembers(
                                parsed_url.query.group,
                                response);
                            break;
                        case "DELETE":
                            _removeMember(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.email,
                                response);
                            break;
                        default:
                            _finishResponse(501, response);
                    }
                    break;
                case "/groups/data":
                    switch(request.method){
                        case "PUT":
                            _submitUpdate(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.field,
                                JSON.parse(data),
                                response
                            );
                            break;
                        case "GET":
                            _getGroupData(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.field,
                                response
                            );
                            break;
                        default:
                            _finishResponse(501, response);
                    }
                    break;
                case "/groups/data/permissions":
                    switch(request.method){
                        case "PUT":
                            _grantPermission(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.email,
                                parsed_url.query.field,
                                response
                            );
                            break;
                        case "DELETE":
                            _revokePermission(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.email,
                                parsed_url.query.field,
                                response
                            );
                            break;
                        default:
                            _finishResponse(501, response);
                    }
                    break;
                case "/groups/input":
                    switch(request.method){
                        case "POST":
                            _submitInput(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                data,
                                response
                            );
                            break;
                        case "GET":
                            _listenInputs(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.time,
                                response
                            );
                            break;
                        default:
                            _finishResponse(501, response);
                    }
                    break;
                case "/groups/updates":
                    switch(request.method){
                        case "GET":
                            _listenUpdates(
                                parsed_url.query.session_id,
                                parsed_url.query.group,
                                parsed_url.query.time,
                                response
                            );
                            break;
                    }
                default:
                    _finishResponse(400, response);
            }
        });
    }

    /**
     * Checks if a session token corresponds to an entry in the users table, and if so if that token is expired or not
     * If token is valid, resets the timeout period on it
     * @param session_id
     * @param response
     * @param callback
     * @responds K.ERROR if there is an error with the queries
     * @responds K.INVALID if the token is not found on the database
     * @responds K.UNAUTH if the token is expired
     * @callback otherwise
     */
    function _checkCredentials(session_id, response, callback){
        connection.query("SELECT email, timeout, lastping FROM users WHERE session_id = ? LIMIT 1;", [session_id],
            function(err, result){
                if(err) _finishResponse(K.ERROR, response, err.toString());
                else if(result.length === 0) _finishResponse(K.INVALID, response);
                else if(result[0].lastping + result[0].timeout * 60000 <= _getTime()) _finishResponse(K.UNAUTH, response);
                else connection.query("UPDATE users SET lastping = ? WHERE email = ? LIMIT 1;", [_getTime(), result[0].email],
                        function(err){
                            if(err) _finishResponse(K.ERROR, response);
                            callback(result[0].email);
                        });
            });
    }

    /**
     * Writes an http status header to the given response object and sends the response to the requesting user with
     * the time of response and the given content in the message body
     * @param status
     * @param response
     * @param body
     */
    function _finishResponse(status, response, body){
        response.writeHead(status);
        response.end(JSON.stringify({timestamp: _getTime(), body: body}));
        console.log(body);
    }

    function _getTime(){
        return new Date().getTime();
    }
}() );

K.server.listen(port);

//TODO: list groups member is in
