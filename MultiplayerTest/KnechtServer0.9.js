/*jslint nomen: true, white: true, vars: true */
/*global document, window, screen, console, require */

(function()
{
    "use strict";

    //region Server Configuration Variables
    var port = 8088; //Server port the server will be listening on
    var db_config =
    {
        host: 'localhost',
        user: 'root',
        password:'7Frog1ufo6',
        reconnect_delay: 2000,
        column_size: //Note: field size variables only apply if tables do not already exist in the database
        {
            username: 255,
            password: 32,
            timestamp: 64,
            session_id: 320,
            application: 64,
            field: 128,
            group: 64,
            data: 0xFFFFFF,
            input: 0xFFFFFF
        }
    };
    //http response code macros, corresponding to knecht status messages
    var OK = 200; //the request was fulfilled successfully
    var UNAUTHORIZED = 401; //the request could not be fulfilled because the authentication parameters are invalid
    var INVALID = 403; //the request could not be fulfilled because an invalid resource/argument has been specified
    var ERROR = 500; //the request could not be fulfilled because a database error has occurred
    var access_whitelist = '*'; //domains allowed to access the knecht server functions
    //standard error messages sent on non-OK result
    var err_msg =
    {
        request_err: {error: 'Unsupported Request'},
        db_err: {error: 'Database Error'},
        incorrect_args: {error: 'Incorrect Argument'},
        invalid_session: {error:'Invalid Session ID'},
        expired_session: {error: 'Expired Session ID'},
        no_user: {error: 'User Not Registered'},
        no_group: {error: 'Group Doesn\'t Exist'},
        not_host: {error: 'User Is Not Host'},
        dup_user: {error: 'User Already Registered'},
        dup_group: {error: 'Group Already Exists'},
        dup_member: {error: 'Group Already Includes User'},
        wrong_pass: {error: 'Incorrect Password'}
    };
    //endregion

    //region Globals
    var mysql = require('mysql'); //Node.js module for interacting with the mysql database
    var url = require('url'); //Node.js module for parsing request urls
    var http = require('http'); //Node.js module for handling http requests
    var connection; //object representing the open connection to the mysql database
    var hooks = {}; //stores response objects from listen requests. sorted by groups on outer level, members on inner
    //endregion

    //region Initialization Functions
    function _connect() //recommended disconnect handler from https://github.com/felix/node-mysql/blob/master/Readme.md
    {
        connection = mysql.createConnection(db_config);
        connection.connect(function(err)
        {
            if(err)
            {
                window.setTimeout(_connect, db_config.reconnect_delay);
            } //if connecting fails, try again after delay
        });
        connection.on('error', function(err) //reconnect automatically if disconnected, or throw error if other db error
        {
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
    function _initDatabase() //create necessary database tables if they do not yet exist
    {
        connection.query('CREATE DATABASE IF NOT EXISTS knecht;', function(err)
        {
            if(err)
            {
                throw err;
            }
            connection.query('USE knecht;', function(err)
            {
                if(err)
                {
                    throw err;
                }
                connection.query('CREATE TABLE IF NOT EXISTS users(' +
                    'username VARCHAR (' + db_config.column_size.username + '),' +
                    'password VARCHAR (' + db_config.column_size.password + '),' +
                    'timeout INTEGER,' +
                    'session_id VARCHAR (' + db_config.column_size.session_id + '),' +
                    'last_ping VARCHAR (' + db_config.column_size.timestamp + '),' +
                    'PRIMARY KEY (username));',
                    function(err)
                    {
                        if(err)
                        {
                            throw err;
                        }
                        connection.query('CREATE TABLE IF NOT EXISTS user_data(' +
                            'user VARCHAR (' + db_config.column_size.username + '),' +
                            'app VARCHAR (' + db_config.column_size.application + '),' +
                            'field VARCHAR (' + db_config.column_size.field + '),' +
                            'data TEXT (' + db_config.column_size.data + '),' +
                            'PRIMARY KEY (user, app, field),' +
                            'FOREIGN KEY (user) REFERENCES users (username)' +
                            'ON DELETE CASCADE ON UPDATE CASCADE);',
                            function(err)
                            {
                                if(err)
                                {
                                    throw err;
                                }
                            });
                        connection.query('CREATE TABLE IF NOT EXISTS groups(' +
                            'name VARCHAR (' + db_config.column_size.group + '),' +
                            'app VARCHAR (' + db_config.column_size.application + '),' +
                            'password VARCHAR (' + db_config.column_size.password + '),' +
                            'host VARCHAR (' + db_config.column_size.username + '),' +
                            'PRIMARY KEY (name),' +
                            'FOREIGN KEY (host) REFERENCES users (username) ON DELETE CASCADE ON UPDATE CASCADE);',
                            function(err)
                            {
                                if(err)
                                {
                                    throw err;
                                }
                                connection.query('CREATE TABLE IF NOT EXISTS members(' +
                                    'group_name VARCHAR (' + db_config.column_size.group + '),' +
                                    'user VARCHAR (' + db_config.column_size.username + '),' +
                                    'PRIMARY KEY (group_name, user),' +
                                    'FOREIGN KEY (user) REFERENCES users (username)' +
                                    'ON DELETE CASCADE ON UPDATE CASCADE,' +
                                    'FOREIGN KEY (group_name) REFERENCES groups (name)' +
                                    'ON DELETE CASCADE ON UPDATE CASCADE);',
                                    function(err)
                                    {
                                        if(err)
                                        {
                                            throw err;
                                        }
                                    });
                                connection.query('CREATE TABLE IF NOT EXISTS group_data(' +
                                    'group_name VARCHAR (' + db_config.column_size.group + '),' +
                                    'field VARCHAR (' + db_config.column_size.field + '),' +
                                    'data TEXT (' + db_config.column_size.data + '),' +
                                    'PRIMARY KEY (group_name, field),' +
                                    'FOREIGN KEY (group_name) REFERENCES groups(name)' +
                                    'ON DELETE CASCADE ON UPDATE CASCADE);',
                                    function(err)
                                    {
                                        if(err)
                                        {
                                            throw err;
                                        }
                                    });
                                connection.query('CREATE TABLE IF NOT EXISTS updates(' +
                                    'group_name VARCHAR (' + db_config.column_size.group + '),' +
                                    'user VARCHAR (' + db_config.column_size.username + '),' +
                                    'field VARCHAR (' + db_config.column_size.field + '),' +
                                    'time VARCHAR (' + db_config.column_size.timestamp + '),' +
                                    'PRIMARY KEY (group_name, user, field),' +
                                    'FOREIGN KEY (user) REFERENCES users (username)' +
                                    'ON DELETE CASCADE ON UPDATE CASCADE,' +
                                    'FOREIGN KEY (group_name) REFERENCES groups(name)' +
                                    'ON DELETE CASCADE ON UPDATE CASCADE);',
                                    function(err)
                                    {
                                        if(err)
                                        {
                                            throw err;
                                        }
                                    });
                                connection.query('CREATE TABLE IF NOT EXISTS inputs(' +
                                    'group_name VARCHAR (' + db_config.column_size.group + '),' +
                                    'user VARCHAR (' + db_config.column_size.username + '),' +
                                    'input TEXT (' + db_config.column_size.input + '),' +
                                    'time VARCHAR (' + db_config.column_size.timestamp + '),' +
                                    'FOREIGN KEY (user) REFERENCES users (username)' +
                                    'ON DELETE CASCADE ON UPDATE CASCADE,' +
                                    'FOREIGN KEY (group_name) REFERENCES groups(name)' +
                                    'ON DELETE CASCADE ON UPDATE CASCADE);',
                                    function(err)
                                    {
                                        if(err)
                                        {
                                            throw err;
                                        }
                                    });
                                connection.query('CREATE TABLE IF NOT EXISTS permissions(' +
                                    'group_name VARCHAR (' + db_config.column_size.group + '),' +
                                    'user VARCHAR (' + db_config.column_size.username + '),' +
                                    'field VARCHAR (' + db_config.column_size.field + '),' +
                                    'PRIMARY KEY (group_name, user, field),' +
                                    'FOREIGN KEY (user) REFERENCES users (username)' +
                                    'ON DELETE CASCADE ON UPDATE CASCADE,' +
                                    'FOREIGN KEY (group_name) REFERENCES groups (name)' +
                                    'ON DELETE CASCADE ON UPDATE CASCADE);',
                                    function(err)
                                    {
                                        if(err)
                                        {
                                            throw err;
                                        }
                                    });
                            });
                    });
            });
        });

    }
    //endregion

    //region Helper Functions
    function _getTime() //returns the number of milliseconds since midnight January 1, 1970
    {
        return new Date().getTime();
    }

    function _generateSessionID(username) //returns a unique session_id token for the given username
    {
        return username + Math.random();
    }

    function _isJSON (string) //returns true if the given string can be parsed as JSON, otherwise false
    {
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
    //endregion

    //region Response Functions
    function _finishResponse(status, response, body) //applies headers to an http response and sends it to the client
    {
        if(!body)
        {
            body = {};
        }
        body.timestamp = _getTime();
        response.writeHead(status,
            {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': access_whitelist,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': 0
            });
        response.end(JSON.stringify(body));
        console.log(status + JSON.stringify(body));
    }
    function _respondOptions(methods, response) //sends an OPTIONS http response to the client
    {
        response.writeHead(OK,
            {
                'Access-Control-Allow-Origin': access_whitelist,
                'Access-Control-Allow-Methods': methods
            });
        response.end();
    }
    //endregion

    //region Credentials Functions
    function _checkCredentials(session_id, response, callback) //invalid if wrong session_id, unauthorized if expired
    {
        connection.query("SELECT username, timeout, last_ping FROM users WHERE session_id = ? LIMIT 1;",
            [session_id],
            function(err, result)
            {
                if(err)
                {
                    _finishResponse(ERROR, response, err_msg.db_err);
                }
                else if(result.length === 0)
                {
                    _finishResponse(INVALID, response, err_msg.invalid_session);
                }
                else if(result[0].last_ping + result[0].timeout * 60000 <= _getTime() )
                {
                    _finishResponse(UNAUTHORIZED, response, err_msg.expired_session);
                }
                else
                {
                    connection.query("UPDATE users SET last_ping = ? WHERE username = ? LIMIT 1;",
                        [_getTime(), result[0].username],
                        function(err)
                        {
                            if(err)
                            {
                                _finishResponse(ERROR, response, err_msg.db_err);
                            }
                            callback(result[0].username); //return email of user to calling function
                        });
                }
            });
    }
    function _checkHost(username, group, response, callback) //invalid if group doesnt exist, unauthorized if not host
    {
        connection.query("SELECT host FROM groups WHERE name = ? LIMIT 1;",
            [group],
            function(err, result)
            {
                if(err)
                {
                    _finishResponse(ERROR, response, err_msg.db_err);
                }
                else if (result.length === 0)
                {
                    _finishResponse(INVALID, response, err_msg.no_group);
                }
                else if(result[0].host !== username)
                {
                    _finishResponse(UNAUTHORIZED, response, err_msg.not_host);
                }
                else
                {
                    callback();
                } //proceed to calling function
            });
    }
    //endregion

    //region User functions
    function _checkUserRegistered(username, response) //registered: true if user exists on server, otherwise false
    {
        if( typeof username !== 'string' )
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        connection.query("SELECT 1 FROM users WHERE username = ? LIMIT 1;",
            [username],
            function(err, result)
            {
                if(err)
                {
                    _finishResponse(ERROR, response, err_msg.db_err);
                }
                else if (result.length === 0)
                {
                    _finishResponse(OK, response, {registered: false});
                }
                else
                {
                    _finishResponse(OK, response, {registered: true});
                }
            });
    }
    function _register(username, password, timeout, response)//user's session_id set if login successful, sent to client
    {
        if(!_isJSON(password))
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        password = JSON.parse(password);
        timeout = parseInt(timeout, 10);
        if(typeof username !== 'string' || typeof password !== 'string' || isNaN(timeout) )
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        var session_id = _generateSessionID(username);
        connection.query("INSERT INTO users VALUES (?, ?, ?, ?, ?);",
            [username, password, timeout, session_id, _getTime()],
            function(err)
            {
                if(err)
                {
                    if(err.code === "ER_DUP_ENTRY")
                    {
                        _finishResponse(INVALID, response,  err_msg.dup_user);
                    }
                    else
                    {
                        _finishResponse(ERROR, response, err_msg.db_err);
                    }
                }
                else
                {
                    _finishResponse(OK, response, {session: session_id});
                } //user registered and logged in successfully
            });
    }
    function _unregister(session_id, response) //removes all data on user except pending group input
    {
        if(typeof session_id !== 'string')
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            connection.query("SELECT name FROM groups WHERE host = ?;",
                [username],
                function(err, result)
                {
                    if(err)
                    {
                        _finishResponse(ERROR, response, err_msg.db_err);
                    }
                    else
                    {
                        connection.query("DELETE FROM users WHERE username = ? LIMIT 1;",
                            [username],
                            function(err)
                            {
                                if(err)
                                {
                                    _finishResponse(ERROR, response, err_msg.db_err);
                                }
                                else
                                {
                                    var i, member;
                                    _finishResponse(OK, response); //user successfully removed from database
                                    for(i = 0; i < result.length; i += 1)
                                    {
                                        for(member in hooks[result[i].name])
                                        {
                                            if (hooks[result[i].name].hasOwnProperty(member))
                                            {
                                                _finishResponse(OK, hooks[result[i].name][member]); //notify group members
                                            }
                                        }//remove stored response objects for user
                                        delete hooks[result[i].name];
                                    }
                                }
                            });
                    }
                });
        });
    }


    //endregion

    //region User Session functions
    function _login(username, password, response) //session_id set if successful and sent to client
    {
        if(!_isJSON(password))
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        password = JSON.parse(password);
        if(typeof username !== 'string' || typeof password !== 'string')
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        connection.query("SELECT password FROM users WHERE username = ? LIMIT 1;",
            [username],
            function(err, result)
            {
                if(err)
                {
                    _finishResponse(ERROR, response, err_msg.db_err);
                }
                else if(result.length === 0)
                {
                    _finishResponse(INVALID, response, err_msg.no_user);
                }
                else if(result[0].password !== password)
                {
                    _finishResponse(UNAUTHORIZED, response, err_msg.wrong_pass);
                }
                else
                {
                    var session_id = _generateSessionID(username);
                    connection.query("UPDATE users SET session_id = ?, last_ping = ? WHERE username = ? LIMIT 1;",
                        [session_id, _getTime(), username],
                        function(err)
                        {
                            if(err)
                            {
                                _finishResponse(ERROR, response, err_msg.db_err);
                            }
                            else
                            {
                                _finishResponse(OK, response, {session_id: session_id});
                            } //login successful
                        });
                }
            });
    }

    function _logout(session_id, response) //expires session_id if successful
    {
        if(typeof session_id !== 'string')
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            connection.query("UPDATE users SET last_ping = 0 WHERE username = ? LIMIT 1;",
                [username],
                function(err)
                {
                    if(err)
                    {
                        _finishResponse(ERROR, response, err_msg.db_err);
                    }
                    else
                    {
                        _finishResponse(OK, response);
                    } //logout successful
                });
        });
    }
    //endregion

    //region User Password functions
    function _recoverPassword(username, response) //treats username as an email address to send password details to
    {
        if(typeof username !== 'string')
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        connection.query("SELECT 1 FROM users WHERE username = ?;",
            [username],
            function(err, result)
            {
                if(err)
                {
                    _finishResponse(ERROR, response, err_msg.db_err);
                }
                else if(result === 0)
                {
                    _finishResponse(INVALID, response, err_msg.no_user);
                }
                else
                {
                    //TODO: send recovery email
                    _finishResponse(OK, response);
                }
            });
    }
    function _changePassword(session_id, password, response)
    {
        if(!_isJSON(password))
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        password = JSON.parse(password);
        if(typeof session_id !== 'string' || typeof password !== 'string')
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            connection.query("UPDATE users SET password = ? WHERE username = ? LIMIT 1;",
                [password, username],
                function(err)
                {
                    if(err)
                    {
                        _finishResponse(ERROR, response, err_msg.db_err);
                    }
                    else
                    {
                        _finishResponse(OK, response);
                    }
                });
        });
    }
    //endregion

    //region User Data functions
    function _putData(session_id, app, field, data, response) //can either put single or multiple pieces of data at once
    {
        if(typeof session_id !== 'string' || typeof app !== 'string' || !_isJSON(field) || !_isJSON(data))
        {
            _finishResponse(INVALID, err_msg.incorrect_args);
            return;
        }
        field = JSON.parse(field);
        data = JSON.parse(data);
        if(typeof field === 'string')
        {
            field = [field];
            data = [data];
        }
        else if(!(field instanceof Array) || !(data instanceof Array) || field.length !== data.length)
        {
            _finishResponse(INVALID, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            var i, values;
            values = '';
            for(i = 0; i < field.length; i += 1)
            {
                if(typeof field[i] !== 'string')
                {
                    _finishResponse(INVALID, response, err_msg.incorrect_args);
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
            connection.query("INSERT INTO user_data VALUES " + values + " ON DUPLICATE KEY UPDATE user_data SET data = VALUES(data);",
                function(err)
                {
                    if(err)
                    {
                        _finishResponse(ERROR, response, err_msg.db_err);
                    }
                    else
                    {
                        _finishResponse(OK, response);
                    }
                });
        });
    }
    function _getData(session_id, app, field, response) //can get either single or multiple pieces of data at once
    {
        if(typeof session_id !== 'string' || typeof app !== 'string' || !_isJSON(field))
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        field = JSON.parse(field);
        if(typeof field === 'string')
        {
            field = [field];
        }
        else if(!(field instanceof Array))
        {
            _finishResponse(INVALID, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            var i, query_fields;
            query_fields = '';
            for(i = 0; i < field.length; i += 1){
                if(typeof field[i] !== 'string')
                {
                    _finishResponse(INVALID, err_msg.incorrect_args);
                    return;
                }
                query_fields += "field = " + connection.escape(field[i]);
                if(i < field.length -1)
                {
                    query_fields += " OR ";
                }
            }
            connection.query("SELECT field, data FROM user_data WHERE user = ? AND app = ? AND (" + query_fields + ");",
                [username, app],
                function(err, result)
                {
                    if(err)
                    {
                        _finishResponse(ERROR, response, err_msg.db_err);
                    }
                    else{
                        var data = {};
                        for(i = 0; i < result.length; i += 1)
                        {
                            data[result[i].field] = JSON.parse(result[i].data);
                        }
                        _finishResponse(OK, response, {data: data});
                    }
                });
        });
    }
    function _deleteData(session_id, app, field, response) //can delete either single or multiple pieces of data at once
    {
        if(typeof session_id !== 'string' || typeof app !== 'string' || !_isJSON(field))
        {
            _finishResponse(INVALID, err_msg.incorrect_args);
            return;
        }
        field = JSON.parse(field);
        if(typeof field === 'string')
        {
            field = [field];
        }
        else if(!(field instanceof Array))
        {
            _finishResponse(INVALID, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response,function(username)
        {
            var i, query_fields;
            query_fields = '';
            for(i = 0; i < field.length; i += 1)
            {
                if(typeof field[i] !== 'string')
                {
                    _finishResponse(INVALID, err_msg.incorrect_args);
                    return;
                }
                query_fields += "field = " + connection.escape(field[i]);
                if(i < field.length -1)
                {
                    query_fields += " OR ";
                }
            }
            connection.query("DELETE FROM user_data WHERE user = ? AND app = ? AND (" + query_fields + ");",
                [username, app],
                function(err)
                {
                    if(err)
                    {
                        _finishResponse(ERROR, response, err_msg.db_err);
                    }
                    else
                    {
                        _finishResponse(OK, response);
                    }
                });
        });
    }
    //endregion

    //region Groups functions
    function _startGroup(session_id, name, app, password, response) //starts group and sets requester as host
    {
        if(!_isJSON(password))
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        password = JSON.parse(password);
        if(typeof session_id !== 'string' || typeof name !=='string' || typeof app !=='string' || typeof password !== 'string')
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            connection.query("INSERT INTO groups VALUES (?, ?, ?, ?);",
                [name, app, password, username],
                function(err)
                {
                    if(err)
                    {
                        if(err.code === "ER_DUP_ENTRY")
                        {
                            _finishResponse(INVALID, response, err_msg.dup_group);
                        }
                        else
                        {
                            _finishResponse(ERROR, response, err_msg.db_err);
                        }
                    }
                    else
                    {
                        hooks[name] = {}; //create object to hold pending responses for this group
                        _finishResponse(OK, response);
                    }
                });
        });
    }

    function _listGroupsOfApp(app, response) //returns array of group names using the given app
    {
        if(typeof app !== 'string')
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        connection.query("SELECT name FROM groups WHERE app = ?;", [app], function(err, result)
        {
            if(err)
            {
                _finishResponse(ERROR, response, err_msg.db_err);
            }
            else{
                var i, group_list = [];
                for(i = 0; i < result.length; i += 1)
                {
                    group_list.push(result[i].name);
                }
                _finishResponse(OK, response, {groups: group_list});
            }
        });
    }

    function _closeGroup(session_id, group, response) //deletes a group and all its data
    {
        if(typeof session_id !=='string' || typeof group !=='string')
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            _checkHost(username, group, response, function()
            {
                connection.query("DELETE FROM groups WHERE name = ? LIMIT 1;",
                    [group],
                    function(err)
                    {
                        if(err)
                        {
                            _finishResponse(ERROR, response, err_msg.db_err);
                        }
                        else {
                            var member;
                            _finishResponse(OK, response);
                            for(member in hooks[group]){
                                if (hooks[group].hasOwnProperty(member))
                                {
                                    _finishResponse(OK, hooks[group][member]);
                                }
                            } //notify members
                            delete hooks[group];
                        }
                    });
            });
        });
    }
    //endregion

    //region Group Password functions
    function _checkGroupPassword(group, password, response) //responds true if password for group is correct, else false
    {
        if(typeof group !== 'string' || !_isJSON(password))
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        password = JSON.parse(password);
        if(typeof password !== 'string')
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        connection.query("SELECT 1 FROM groups WHERE name = ? AND password = ? LIMIT 1;",
            [group, password],
            function(err, result){
                if(err)
                {
                    _finishResponse(ERROR, response, err_msg.db_err);
                }
                else if(result.length === 0)
                {
                    _finishResponse(OK, response, {correct: false});
                }
                else
                {
                    _finishResponse(OK, response, {correct: true});
                }
            });
    }
    //endregion

    //region Group Members functions
    function _addMember(session_id, group, member, response)
    {
        if(typeof session_id !== 'string' || typeof group !== 'string' || typeof member !== 'string')
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            _checkHost(username, group, response, function(){
                if(member === username)
                {
                    _finishResponse(INVALID, response, err_msg.dup_member);
                    return;
                }
                connection.query("INSERT INTO members VALUES (?, ?);",
                    [group, member],
                    function(err)
                    {
                        if(err)
                        {
                            if(err.code === "ER_DUP_ENTRY")
                            {
                                _finishResponse(INVALID, response, err_msg.dup_member);
                            }
                            else
                            {
                                _finishResponse(ERROR, response, err_msg.db_err);
                            }
                        }
                        else
                        {
                            _finishResponse(OK, response);
                        }
                    });
            });
        });
    }
    function _listMembersOfGroup(group, response)
    {
        if(typeof group !== 'string')
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        connection.query("SELECT host FROM groups WHERE name = ? LIMIT 1;",
            [group],
            function(err, host)
            {
                if(err)
                {
                    _finishResponse(ERROR, response, err_msg.db_err);
                }
                else if(host.length === 0)
                {
                    _finishResponse(INVALID, response, err_msg.no_group);
                }
                else
                {
                    var members = [];
                    connection.query("SELECT user FROM members WHERE group_name = ?;",
                        [group],
                        function(err, result)
                        {
                            if(err)
                            {
                                _finishResponse(ERROR, response, err_msg.db_err);
                            }
                            else
                            {
                                var i;
                                for(i = 0; i < result.length; i += 1)
                                {
                                    members.push(result[i].user);
                                }
                                _finishResponse(OK, response, {host: host[0].host, members: members});
                            }
                        });
                }
            });
    }

    function _removeMember(session_id, group, member, response) //removes a user from a group and deletes their info in it
    {
        if(typeof session_id !== 'string' || typeof group !== 'string' || typeof member !== 'string')
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            _checkHost(username, group, response, function()
            {
                if(username === member)
                {
                    _closeGroup(session_id, group, response);
                } //host has quit, close group instead
                else
                { //clear up the removed user's info in the group
                    if(hooks[group][member])
                    {
                        _finishResponse(OK, hooks[group][member]);
                    }
                    connection.query("DELETE FROM members WHERE group_name = ? AND user = ? LIMIT 1;",
                        [group, member],
                        function(err)
                        {
                            if(err)
                            {
                                _finishResponse(ERROR, response, err_msg.db_err);
                            }
                            else
                            {
                                connection.query("DELETE FROM updates WHERE group_name = ? AND user = ?;",
                                    [group, member],
                                    function(err)
                                    {
                                        if(err)
                                        {
                                            _finishResponse(ERROR, response, err_msg.db_err);
                                        }
                                        else
                                        {
                                            connection.query("DELETE FROM inputs WHERE group_name = ? AND user = ?;",
                                                [group, member],
                                                function(err)
                                                {
                                                    if(err)
                                                    {
                                                        _finishResponse(ERROR, response, err_msg.db_err);
                                                    }
                                                    else
                                                    {
                                                        _finishResponse(OK, response);
                                                    }
                                                });
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
    function _retrieveUpdates(username, group, timestamp){
        connection.query("SELECT field FROM updates WHERE group_name = ? AND user = ?",
            [group, username],
            function(err, updates){
                if(err)
                {
                    _finishResponse(ERROR, hooks[group][username], err_msg.db_err);
                }
                else if(updates.length > 0) //only retrieve if there are new updates
                {
                    var i, contents, _respondUpdates;
                    contents = [];
                    _respondUpdates = function(err)
                    {
                        if(err)
                        {
                            _finishResponse(ERROR, hooks[group][username], err_msg.db_err);
                        }
                        else
                        {
                            _finishResponse(OK, hooks[group][username], {updates: contents});
                        }
                    };
                    for(i = 0; i < updates.length; i += 1)
                    {
                        contents.push(updates[i].field);
                        connection.query("DELETE FROM updates WHERE group_name = ? AND user = ? AND time < ?;",
                            [group, updates[i].user, timestamp],
                            _respondUpdates);
                    }
                }
            });
    }

    function _listenUpdates(session_id, group, timestamp, response){
        if(typeof session_id !== 'string' || typeof group !== 'string' || typeof timestamp !== 'number')
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username){
            connection.query("SELECT 1 FROM members WHERE group_name = ? AND user = ?;",
                [group, username],
                function(err, result){
                    if(err)
                    {
                        _finishResponse(ERROR, response, err_msg.db_err);
                    }
                    else if(result.length === 0)
                    {
                        _finishResponse(INVALID, response);
                    }
                    else
                    {
                        hooks[group][username] = response;
                        _retrieveUpdates(username, group, timestamp);
                    }
                });
        });
    }
    //endregion

    //region Groups Input functions
    function _retrieveInput(group, timestamp){
        connection.query("SELECT host FROM groups WHERE name = ? LIMIT 1;",
            [group],
            function(err, host)
            {
                connection.query("SELECT user, input, time FROM inputs WHERE group_name = ?",
                    [group],
                    function(err, input)
                    {
                        if(err)
                        {
                            _finishResponse(ERROR, hooks[group][host[0].host], err_msg.db_err);
                        }
                        else if(input.length > 0)
                        {
                            var i, contents, _respondUpdates;
                            contents = [];
                            _respondUpdates = function(err)
                            {
                                if(err)
                                {
                                    _finishResponse(ERROR, hooks[group][host[0].host], err_msg.db_err);
                                }
                                else
                                {
                                    _finishResponse(OK, hooks[group][host[0].host], {updates: contents});
                                }
                            };
                            for(i = 0; i < input.length; i += 1) {
                                contents.push({user: input[i].user, input: input[i].input, time: input[i].time});
                                connection.query("DELETE FROM inputs WHERE group_name = ? AND user = ? AND input = ? AND time < ? LIMIT 1;",
                                    [group, input[i].user, input[i].input, timestamp],
                                    _respondUpdates);
                            }
                        }
                    });
            });
    }

    function _listenInputs(session_id, group, timestamp, response){
        if(typeof session_id !== 'string' || typeof group !== 'string' || typeof timestamp !== 'number')
        {
            _finishResponse(INVALID, response, err_msg.db_err);
            return;
        }
        _checkCredentials(session_id, response, function(username){
            _checkHost(username, group, response, function(){
                hooks[group][username] = response;
                _retrieveInput(group, timestamp);
            });
        });
    }

    function _submitInput(session_id, group, input, response){
        if(typeof session_id !== 'string' || typeof group !== 'string' || !_isJSON(input))
        {
            _finishResponse(INVALID, response, err_msg.db_err);
            return;
        }
        _checkCredentials(session_id, response, function(username){
            connection.query("INSERT INTO inputs VALUES (?, ?, ?, ?);",
                [group, username, input, _getTime()],
                function(err){
                    if(err)
                    {
                        _finishResponse(ERROR, response, err_msg.db_err);
                    }
                    else {
                        _finishResponse(OK, response);
                        _retrieveInput(group, 0);
                    }
                });
        });
    }
    //endregion

    //region Group Permissions functions
    function _insertPermissions(group, permitted_values, update_values, updated_members, response)
    {
        connection.query("INSERT INTO permissions VALUES " + permitted_values + " ON DUPLICATE KEY UPDATE field = field",
            function(err)
            {
                if(err)
                {
                    console.log(err.toString());
                    _finishResponse(ERROR, response, err_msg.db_err);
                }
                else
                {
                    connection.query("INSERT INTO updates VALUES" + update_values +
                        "ON DUPLICATE KEY UPDATE time=VALUES(time);", function(err)
                    {
                        if(err)
                        {
                            console.log(err.toString());
                            _finishResponse(ERROR, response, err_msg.db_err);
                        }
                        else
                        {
                            var i;
                            _finishResponse(OK, response);
                            for (i = 0; i < updated_members.length; i += 1)
                            {
                                _retrieveUpdates(updated_members[i], group, 0);
                            }
                        }
                    });
                }
            });
    }

    function _setPermissions(session_id, group, field, members, permissions, response)
    {
        var i, j;
        if(typeof session_id !== 'string' || typeof group !== 'string' || !_isJSON(field))
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        field = JSON.parse(field);
        if(typeof field === 'string')
        {
            field = [field];
        }
        else if(!(field instanceof Array) || field.length === 0)
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        if(permissions) //need to check permission arguments now to prevent false success message before checking in the set step
        {
            var permissions_array;
            if(!_isJSON(permissions) || (members && !_isJSON(members)))
            {
                _finishResponse(INVALID, response, err_msg.incorrect_args);
                return;
            }
            permissions = JSON.parse(permissions);
            if(members)
            {
                members = JSON.parse(members);
                if(typeof members === 'string') //permissions set for a single member
                {
                    var members_array = [];
                    for(i = 0; i < field.length; i += 1)
                    {
                        members_array[i] = members;
                    }
                    members = members_array;
                }
                else if(!(members instanceof Array))
                {
                    _finishResponse(INVALID, response, err_msg.incorrect_args);
                    return;
                }
                for(i = 0; i < members.length; i += 1)
                {
                    if(typeof members[i] !== 'string')
                    {
                        _finishResponse(INVALID, response, err_msg.incorrect_args);
                        return;
                    }
                }
            }
            if(typeof permissions === 'boolean') //a single permission for all fields
            {
                permissions_array = [];
                for(i = 0; i < field.length; i += 1)
                {
                    if(members) //permission applies to only members specified
                    {
                        permissions_array[i] = [];
                        for(j = 0; j < members.length; j += 1)
                        {
                            permissions_array[i][j] = permissions;
                        }
                    }
                    else
                    {
                        permissions_array[i] = [permissions];
                    } //permission applies to all users
                }
                permissions = permissions_array;
            }
            else if(permissions instanceof Array && permissions.length === field.length)
            {
                var array_of;
                if(typeof permissions[0] === 'boolean')
                {
                    array_of = 'boolean';
                }
                else if(permissions[0] instanceof Array)
                {
                    array_of = 'array';
                }
                for(i = 0; i < permissions.length; i += 1)
                {
                    if((array_of === 'boolean' && typeof permissions[i] !== 'string') ||
                        (array_of === 'array' && !(permissions[i] instanceof Array)))
                    {
                        _finishResponse(INVALID, response, err_msg.incorrect_args);
                        return;
                    }
                    if(array_of === 'array')
                    {
                        for(j = 0; j < members.length; j += 1)
                        {
                            if(typeof permissions[i][j] !== 'boolean')
                            {
                                _finishResponse(INVALID, response, err_msg.incorrect_args);
                                return;
                            }
                        }
                    }
                }
                if(array_of === 'boolean') //a different permission set for each field
                {
                    permissions_array = [];
                    for(i = 0; i < field.length; i += 1)
                    {
                        if(members)
                        {
                            permissions_array[i] = [];
                            for(j = 0; j <members.length; j += 1)
                            {
                                permissions_array[i][j] = permissions[i];
                            }
                        }
                        else
                        {
                            permissions_array[i] = [permissions[i]];
                        }
                    }
                    permissions = permissions_array;
                }
                else if(array_of !== 'array')//different permissions for each field and member
                {
                    _finishResponse(INVALID, response, err_msg.incorrect_args);
                    return;
                }
            }
            else
            {
                _finishResponse(INVALID, response, err_msg.incorrect_args);
                return;
            }
        }
        _checkCredentials(session_id, response, function(username)
        {
            _checkHost(username, group, response, function(){
                var permitted_values, forbidden_values, update_values, shared_fields, updated_members;
                permitted_values = '';
                forbidden_values = '';
                update_values = '';
                updated_members = [];
                if(!members)
                {
                    members = [username];
                } //if no member specified, use host to indicate permission is for all
                for(i = 0; i < field.length; i += 1)
                {
                    for(j = 0; j < members.length; j += 1)
                    {
                        if(permissions[i][j]) //granting permission
                        {
                            if(updated_members.indexOf(members[j]) === -1 && members[j] !== username)
                            {
                                updated_members.push(members[j]);
                            }
                            shared_fields = "("
                                + connection.escape(group) + ","
                                + connection.escape(members[j]) + ","
                                + connection.escape(field[i]);
                            permitted_values += shared_fields + "),";
                            update_values += shared_fields + ',' + _getTime() + "),";
                        }
                        else //revoking permission
                        {
                            forbidden_values +=
                                " (field = " + connection.escape(field[i]) +
                                    " AND user = " + connection.escape(members[j]) + ") OR";
                        }
                    }
                }
                if(forbidden_values)
                {
                    forbidden_values = forbidden_values.slice(0, -2);
                    connection.query("DELETE FROM permissions WHERE group_name = ? AND ( " + forbidden_values + " );",
                        [group], function(err)
                        {
                            if(err)
                            {
                                _finishResponse(ERROR, response, err_msg.db_err);
                            }
                            else if(permitted_values)
                            {
                                permitted_values = permitted_values.slice(0, -1);
                                update_values = update_values.slice(0, -1);
                                _insertPermissions(group, permitted_values, update_values, updated_members, response);
                            }
                            else
                            {
                                _finishResponse(OK, response);
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
                    _finishResponse(OK, response);
                }
            });
        });
    }
    //endregion

    //region Group Data functions
    function _submitUpdates(session_id, group, field, data, permissions, members, response)//submit data and notify users
    {
        var i, j;
        if(typeof session_id !== 'string' || typeof group !== 'string' || !_isJSON(field) || !_isJSON(data))
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        field = JSON.parse(field);
        data = JSON.parse(data);
        if(typeof field === 'string')
        {
            field = [field];
            data = [data];
        }
        else if(!(field instanceof Array) || !(data instanceof Array) || field.length !== data.length || field.length === 0)
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        if(permissions) //need to check permission arguments now to prevent false success message before checking in the set step
        {
            var permissions_array;
            if(!_isJSON(permissions) || (members && !_isJSON(members)))
            {
                _finishResponse(INVALID, response, err_msg.incorrect_args);
                return;
            }
            permissions = JSON.parse(permissions);
            if(members)
            {
                members = JSON.parse(members);
                if(typeof members === 'string') //permissions set for a single member
                {
                    var members_array = [];
                    for(i = 0; i < field.length; i += 1)
                    {
                        members_array[i] = members;
                    }
                    members = members_array;
                }
                else if(!(members instanceof Array))
                {
                    _finishResponse(INVALID, response, err_msg.incorrect_args);
                    return;
                }
                for(i = 0; i < members.length; i += 1)
                {
                    if(typeof members[i] !== 'string')
                    {
                        _finishResponse(INVALID, response, err_msg.incorrect_args);
                        return;
                    }
                }
            }
            if(typeof permissions === 'string') //a single permission for all fields
            {
                permissions_array = [];
                for(i = 0; i < field.length; i += 1)
                {
                    if(members) //permission applies to only members specified
                    {
                        permissions_array[i] = [];
                        for(j = 0; j < members.length; j += 1)
                        {
                            permissions_array[i][j] = permissions;
                        }
                    }
                    else
                    {
                        permissions_array[i] = [permissions];
                    } //permission applies to all users
                }
                permissions = permissions_array;
            }
            else if(permissions instanceof Array && permissions.length === field.length)
            {
                var array_of;
                if(typeof permissions[0] === 'string')
                {
                    array_of = 'string';
                }
                else if(permissions[0] instanceof Array)
                {
                    array_of = 'array';
                }
                for(i = 0; i < permissions.length; i += 1)
                {
                    if((array_of === 'string' && typeof permissions[i]  !== 'string') ||
                        (array_of === 'array' && !(permissions[i] instanceof Array)))
                    {
                        _finishResponse(INVALID, response, err_msg.incorrect_args);
                        return;
                    }
                    if(array_of === 'array')
                    {
                        for(j = 0; j < members.length; j += 1)
                        {
                            if(typeof(permissions[i][j]) !== 'string')
                            {
                                _finishResponse(INVALID, response, err_msg.incorrect_args);
                                return;
                            }
                        }
                    }
                }
                if(array_of === 'string') //a different permission set for each field
                {
                    permissions_array = [];
                    for(i = 0; i < field.length; i += 1)
                    {
                        if(members)
                        {
                            permissions_array[i] = [];
                            for(j = 0; j <members.length; j += 1)
                            {
                                permissions_array[i][j] = permissions[i];
                            }
                        }
                        else
                        {
                            permissions_array[i] = [permissions[i]];
                        }
                    }
                    permissions = permissions_array;
                }
                else if(array_of !== 'array')//different permissions for each field and member
                {
                    _finishResponse(INVALID, response, err_msg.incorrect_args);
                    return;
                }
            }
            else
            {
                _finishResponse(INVALID, response, err_msg.incorrect_args);
                return;
            }
        }
        _checkCredentials(session_id, response, function(username)
        {
            _checkHost(username, group, response, function()
            {
                var data_values, query_fields;
                data_values = '';
                query_fields = '';
                for(i = 0; i < field.length; i += 1)
                {
                    if(typeof(field[i]) !== 'string')
                    {
                        _finishResponse(INVALID, response, err_msg.incorrect_args);
                        return;
                    }
                    data_values += "("
                        + connection.escape(group) + ","
                        + connection.escape(field[i]) + ","
                        + connection.escape(JSON.stringify(data[i])) + ")";
                    query_fields += "field = " + connection.escape(field[i]);
                    if(i < field.length -1)
                    {
                        data_values += ",";
                        query_fields += " OR ";
                    }
                }
                connection.query("INSERT INTO group_data VALUES " +data_values+
                    " ON DUPLICATE KEY UPDATE data = VALUES(data);",
                    function(err)
                    {
                        if(err)
                        {
                            _finishResponse(ERROR, response, err_msg.db_err);
                        }
                        else
                        {
                            connection.query("SELECT user, field FROM permissions WHERE group_name = ? AND" +
                                "(" + query_fields + ");",
                                [group],
                                function(err, result)
                                {
                                    if(err)
                                    {
                                        _finishResponse(ERROR, response, err_msg.db_err);
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
                                                + _getTime() + ')';
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
                                                    {
                                                        _finishResponse(ERROR, response, err_msg.db_err);
                                                    }
                                                    else
                                                    {
                                                        for(i = 0; i < updated_members.length; i += 1)
                                                        {
                                                            _retrieveUpdates(group, 0);
                                                        }
                                                        if(permissions)
                                                        {
                                                            _setPermissions(session_id, group, field, members, permissions, response);
                                                        }
                                                        else
                                                        {
                                                            _finishResponse(OK, response);
                                                        }
                                                    }
                                                });
                                        }
                                        else
                                        {
                                            if(permissions)
                                            {
                                                _setPermissions(session_id, group, field, members, permissions, response);
                                            }
                                            else
                                            {
                                                _finishResponse(OK, response);
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
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        field = JSON.parse(field);
        if(typeof field === 'string')
        {
            field = [field];
        }
        else if(!(field instanceof Array) || field.length === 0)
        {
            _finishResponse(INVALID, response, err_msg.incorrect_args);
            return;
        }
        _checkCredentials(session_id, response, function(username)
        {
            var i, query_fields;
            query_fields = '';
            for(i = 0; i < field.length; i += 1){
                if(typeof field[i] !== 'string')
                {
                    _finishResponse(INVALID, err_msg.incorrect_args);
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
                    {
                        _finishResponse(ERROR, response, err_msg.db_err);
                    }
                    else if(host.length === 0)
                    {
                        _finishResponse(INVALID, response, err_msg.no_group);
                    }
                    else if(host[0].host === username)
                    {
                        connection.query("SELECT field, data FROM group_data WHERE group_name = ? AND " +
                            "(" + query_fields + ");",
                            [group],
                            function(err, result)
                            {
                                if(err)
                                {
                                    _finishResponse(ERROR, response, err_msg.db_err);
                                }
                                else
                                {
                                    var data = {};
                                    for(i = 0; i < result.length; i += 1)
                                    {
                                        data[result[i].field] = JSON.parse(result[i].data);
                                    }
                                    _finishResponse(OK, response, {data: data});
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
                                {
                                    _finishResponse(ERROR, response, err_msg.db_err);
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
                                                    _finishResponse(ERROR, response, err_msg.db_err);
                                                }
                                                else{
                                                    var data = {};
                                                    for(i = 0; i < result.length; i += 1)
                                                    {
                                                        data[result[i].field] = JSON.parse(result[i].data);
                                                    }
                                                    _finishResponse(OK, response, {data: data});
                                                }
                                            });
                                    }
                                    else
                                    {
                                        _finishResponse(OK, response, {data: {}});
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
                            _finishResponse(INVALID, response, err_msg.request_err);
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
                            _finishResponse(INVALID, response, err_msg.request_err);
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
                            _finishResponse(INVALID, response, err_msg.request_err);
                    }
                    break;
                case "/users/data":
                    switch(request.method)
                    {
                        case "PUT":
                            _putData(parsed_url.query.session_id, parsed_url.query.app, parsed_url.query.field, data, response);
                            break;
                        case "GET":
                            _getData(parsed_url.query.session_id, parsed_url.query.app, parsed_url.query.field, response);
                            break;
                        case "DELETE":
                            _deleteData(parsed_url.query.session_id, parsed_url.query.app, parsed_url.query.field, response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, PUT, DELETE, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(INVALID, response, err_msg.request_err);
                    }
                    break;
                case "/groups":
                    switch(request.method)
                    {
                        case "POST":
                            _startGroup(parsed_url.query.session_id, parsed_url.query.group, parsed_url.query.app, data, response);
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
                            _finishResponse(INVALID, response, err_msg.request_err);
                    }
                    break;
                case "/groups/password":
                    switch(request.method)
                    {
                        case "POST":
                            _checkGroupPassword(parsed_url.query.group, data, response);
                            break;
                        case "OPTIONS":
                            _respondOptions('POST, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(INVALID, response, err_msg.request_err);
                    }
                    break;
                case "/groups/members":
                    switch(request.method)
                    {
                        case "POST":
                            _addMember(parsed_url.query.session_id, parsed_url.query.group, parsed_url.query.username, response);
                            break;
                        case "GET":
                            _listMembersOfGroup(parsed_url.query.group, response);
                            break;
                        case "DELETE":
                            _removeMember(parsed_url.query.session_id, parsed_url.query.group, parsed_url.query.username, response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, POST, DELETE, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(INVALID, response, err_msg.request_err);
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
                            _getGroupData(parsed_url.query.session_id, parsed_url.query.group, parsed_url.query.field, response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, PUT, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(INVALID, response, err_msg.request_err);
                    }
                    break;
                case "/groups/data/permissions":
                    switch(request.method){
                        case "PUT":
                            _setPermissions(parsed_url.query.session_id, parsed_url.query.group, parsed_url.query.fields,
                                parsed_url.query.username, parsed_url.query.permissions, response);
                            break;
                        case "OPTIONS":
                            _respondOptions('PUT, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(INVALID, response, err_msg.request_err);
                    }
                    break;
                case "/groups/updates":
                    switch(request.method){
                        case "GET":
                            _listenUpdates(parsed_url.query.session_id, parsed_url.query.group, parsed_url.query.time, response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(INVALID, response, err_msg.request_err);
                    }
                    break;
                case "/groups/input":
                    switch(request.method){
                        case "POST":
                            _submitInput(parsed_url.query.session_id, parsed_url.query.group, data, response);
                            break;
                        case "GET":
                            _listenInputs(parsed_url.query.session_id, parsed_url.query.group, parsed_url.query.time, response);
                            break;
                        case "OPTIONS":
                            _respondOptions('GET, POST, OPTIONS', response);
                            break;
                        default:
                            _finishResponse(INVALID, response, err_msg.request_err);
                    }
                    break;
                default:
                    _finishResponse(INVALID, response, err_msg.request_err);
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
}() );
