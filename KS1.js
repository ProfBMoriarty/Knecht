var K = {};
port = 8080;

(function(){
    //region Constants
    var db_config = {
        host: "localhost",
        user: "root",
        password:"pass",
        delay: 2000
    };

    var db_field_size = {
        email: 252,
        password: 32,
        app: 64,
        field: 64,
        data: 0xffffff,
        groupname: 128,
        hooks: 0xffffff,
        input: 0xffffff,
        time: 64,
        response: 0xffffff
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
    function _checkUser(email, response){
        connection.query("SELECT EXISTS (SELECT 1 FROM users WHERE email = ?);", [email], function(err, result){
            if(err) _finishResponse(K.ERROR, response, err.toString());
            else if(result === 0) _finishResponse(K.INVALID, response);
            else _finishResponse(K.OK, response);
        });
    }

    function _register(email, password, response){
        connection.query("INSERT INTO users VALUES (?, ?);", [email, password], function(err){
            if(err) {
               if(err.code == "ER_DUP_ENTRY") _finishResponse(K.INVALID, response);
                else _finishResponse(K.ERROR, response, err.toString());
            }
            else _finishResponse(K.OK, response);
        });
    }
    function _login(email, password, response){
        _checkCredentials(email, password, response, function(){
            _finishResponse(K.OK, response);
        });
    }

    function _recoverPassword(email, response){
        connection.query("SELECT EXISTS (SELECT 1 FROM users WHERE email = ?);", [email], function(err, result){
            if(err) _finishResponse(K.ERROR, response, err.toString());
            else if(result === 0) _finishResponse(K.INVALID, response);
            else {
                //TODO: send recovery email
                _finishResponse(K.OK, response);
            }
        });
    }

    function _changePassword(email, password, new_password, response){
        _checkCredentials(email, password, response, function(){
            connection.query("UPDATE users SET password = ? WHERE email = ? LIMIT 1;", [new_password, email], function(err){
                if(err) _finishResponse(K.ERROR, response, err.toString());
                else _finishResponse(K.OK, response);
            });
        });
    }

    function _unregister(email, password, response){ //TODO: clear user from groups
        _checkCredentials(email, password, response, function(){
            connection.query("DELETE FROM users WHERE email = ? LIMIT 1;", [email], function(err){
                if(err) _finishResponse(K.ERROR, response, err.toString());
                else connection.query("DELETE FROM user_data WHERE user = ?;", [email], function(err){
                    if(err) _finishResponse(K.ERROR, response, err.toString());
                    else _finishResponse(K.OK, response);
                });
            });
        });
    }
    //endregion

    //region Users Data functions
    function _putData(email, password, app, field, data, response){
        _checkCredentials(email, password, response, function(){
            connection.query("INSERT INTO user_data VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = ?;",
                [email, app, field, data, data], function(err){
                    if(err) _finishResponse(K.ERROR, response, err.toString());
                    else _finishResponse(K.OK, response);
                });
        });
    }

    function _getData(email, password, app, field, response){
        _checkCredentials(email, password, response, function(){
            connection.query("SELECT data FROM user_data WHERE user = ? AND app = ? AND field = ? LIMIT 1;", [email, app, field], function(err, result){
                if(err) _finishResponse(K.ERROR, response, err.toString());
                else if (result.length === 0) _finishResponse(K.INVALID, response);
                else _finishResponse(K.OK, response, result[0].data);
            });
        });
    }

    function _deleteData(email, password, app, field, response){
        _checkCredentials(email, password, response, function(){
            connection.query("DELETE FROM user_data WHERE user = ? AND app = ? AND field = ? LIMIT 1;", [email, app, field], function(err){
                if(err) _finishResponse(K.ERROR, response, err.toString());
                else _finishResponse(K.OK, response);
            });
        });
    }
    //endregion

    //region Groups functions
    //region Host functions
    function _startGroup(email, password, name, app, grouppass, response){
        _checkCredentials(email, password, response, function(){
            connection.query("INSERT INTO groups VALUES (?, ?, ?, ?);",
                [name, app, grouppass, email], function(err){
                    if(err) {
                        if(err.code == "ER_DUP_ENTRY") _finishResponse(K.INVALID, response);
                        else _finishResponse(K.ERROR, response, err.toString());
                    }
                    else {
                        hooks[name] = {};
                        _finishResponse(K.OK, response);
                    }
                });
        });
    }

    function _closeGroup(email, password, group, response){
        _checkCredentials(email, password, response, function(){
            _checkHost(email, group, response, function(){
                for(var i = 0; i < result.length; i++)
                    if(hooks[group][result[i].user]) _finishResponse(K.OK, hooks[group][result[i].user]);
                delete hooks[group];
                connection.query("DELETE FROM groups WHERE name = ? LIMIT 1;", [group], function(err){
                    if(err) _finishResponse(K.ERROR, response, err.toString());
                    else connection.query("DELETE FROM inputs WHERE groupname = ?;", [group], function(err){
                        if(err) _finishResponse(K.ERROR, response, err.toString());
                        else connection.query("DELETE FROM updates WHERE groupname = ?;", [group], function(err){
                            if(err) _finishResponse(K.ERROR, response, err.toString());
                            else connection.query("DELETE FROM permissions WHERE groupname = ?;", [group], function(err){
                                if(err) _finishResponse(K.ERROR, response, err.toString());
                                else connection.query("DELETE FROM group_data WHERE groupname = ?;", [group], function(err){
                                    if(err) _finishResponse(K.ERROR, response, err.toString());
                                    else connection.query("SELECT user FROM members WHERE groupname = ? LIMIT 1;",
                                        [group], function (err, result){
                                            if(err) _finishResponse(K.ERROR, response, err.toString());
                                            else connection.query("DELETE FROM members WHERE groupname = ?;", [group], function(err){
                                                if(err) _finishResponse(K.ERROR, response, err.toString());
                                                else _finishResponse(K.OK, response);
                                            });
                                        });
                                });
                            });
                        });
                    });
                });
            });
        });
    }

    function _addMember(email, password, group, member, response){
        _checkCredentials(email, password, response, function(){
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

    function _removeMember(email, password, group, member, response){
        _checkCredentials(email, password, response, function(){
            _checkHost(email, group, response, function(){
                if(email === member) _closeGroup(email, password, group, response);
                else connection.query("SELECT 1 FROM members WHERE groupname = ? AND user = ? LIMIT 1;",
                    [group, member], function(err, result){
                        if(err) _finishResponse(K.ERROR, response, err.toString());
                        else if(result.length === 0) _finishResponse(K.INVALID, response);
                        else {
                            if(hooks[group][member]) _finishResponse(K.OK, hooks[group][member]);
                            connection.query("DELETE FROM members WHERE groupname = ? AND user = ? LIMIT 1;",
                                [group, member], function(err){
                                    if(err) _finishResponse(K.ERROR, response, err.toString());
                                    else connection.query("DELETE FROM inputs WHERE groupname = ? AND user = ?;",
                                        [group, member], function(err){
                                            if(err) _finishResponse(K.ERROR, response, err.toString());
                                            else connection.query("DELETE FROM updates WHERE groupname = ? AND user = ?;",
                                                [group, member], function(err){
                                                    if(err) _finishResponse(K.ERROR, response, err.toString());
                                                    else connection.query("DELETE FROM inputs WHERE groupname = ? AND user = ?;",
                                                        [group, member], function(err){
                                                            if(err) _finishResponse(K.ERROR, response, err.toString());
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

    function _submitUpdate(email, password, group, field, data, response){ //TODO: optionally set permissions
        _checkCredentials(email, password, response, function(){
            _checkHost(email, group, response, function(){
                connection.query("INSERT INTO group_data VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = ?;",
                    [group, field, data, data], function(err){
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
                                                + connection.escape(field) + ")";
                                            if(i < permissions.length -1) values += ",";
                                            else values += ";";
                                        }
                                        connection.query("INSERT INTO updates VALUES" + values, function(err){
                                            if(err) _finishResponse(K.ERROR, response, err.toString());
                                            else {
                                                _finishResponse(K.OK, response);
                                                for (var i = 0; i < permissions.length; i++)
                                                    _retrieveUpdates(permissions[i].user, group);
                                            }
                                        });
                                    }
                                });
                        }
                    });
            });
        });
    }

    function _listenInputs(email, password, group, response){
        _checkCredentials(email, password, response, function(){
            _checkHost(email, group, response, function(){
                hooks[group][email] = response;
                _retrieveInput(group);
            });
        });
    }

    function _retrieveInput(group){
        connection.query("SELECT host FROM groups WHERE name = ? LIMIT 1;", [group], function(err, host){
            connection.query("SELECT user, input, time FROM inputs WHERE groupname = ?", [group], function(err, input){
                if(err) _finishResponse(K.ERROR, hooks[group][host[0].host], err.toString());
                else if(input.length > 0) {
                    var contents = [];
                    for(var i = 0; i < input.length; i++) {
                        contents.push({user: input[i].user, input: input[i].input, time: input[i].time});
                        connection.query("DELETE FROM inputs WHERE groupname = ? AND user = ? AND input = ? AND time = ? LIMIT 1;",
                            [group, input[i].user, input[i].input, input[i].time]);
                    }
                    _finishResponse(K.OK, hooks[group][host[0].host], contents);
                }
            });
        });
    }

    function _grantPermission(email, password, group, member, field, response){
        _checkCredentials(email, password, response, function(){
            _checkHost(email, group, response, function(){
                connection.query("INSERT INTO permissions VALUES (?, ?, ?);", [group, member, field], function(err){
                    if(err) _finishResponse(K.ERROR, response, err.toString());
                    else _finishResponse(K.OK);
                });
            });
        });
    }

    function _revokePermission(email, password, group, member, field, response){
        _checkCredentials(email, password, response, function(){
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
    function _submitInput(email, password, group, input, response){
        _checkCredentials(email, password, response, function(){
            connection.query("INSERT INTO inputs VALUES (?, ?, ?, ?);", [group, email, input, new Date().getTime()], function(err){
                if(err) _finishResponse(K.ERROR, response, err.toString());
                else {
                    _finishResponse(K.OK, response);
                    _retrieveInput(group);
                }
            });
        });
    }

    function _listenUpdates(email, password, group, response){
        _checkCredentials(email, password, response, function(){
            connection.query("SELECT EXISTS (SELECT 1 FROM members WHERE groupname = ? AND user = ?);",
                [group, email], function(err, result){
                    if(err) _finishResponse(K.ERROR, response, err.toString());
                    else if(result === 0) _finishResponse(K.INVALID, response);
                    else {
                        hooks[group][email] = response;
                        _retrieveUpdates(email, group);
                    }
                });
        });
    }

    function _retrieveUpdates(email, group){
        connection.query("SELECT field FROM updates WHERE groupname = ? AND user = ?", [group, email], function(err, updates){
            if(err) _finishResponse(K.ERROR, hooks[group][email], err.toString());
            else if(updates.length > 0) {
                var contents = [];
                for(var i = 0; i < updates.length; i++) {
                    contents.push({user: input[i].user, input: input[i].input, time: input[i].time});
                    connection.query("DELETE FROM updates WHERE groupname = ? AND user = ?;", [group, updates[i].user]);
                }
                _finishResponse(K.OK, hooks[group][email], contents);
            }
        });
    }
    //endregion

    function _getGroupData(email, password, group, field, response){ //TODO: let host read it
        _checkCredentials(email, password, response, function(){
            connection.query("SELECT EXISTS (SELECT 1 FROM permissions WHERE groupname = ? AND user = ? AND field = ? LIMIT 1);",
                [group, email, field], function(err, result){
                    if(err) _finishResponse(K.ERROR, response, err.toString());
                    else if(result === 0) _finishResponse(K.UNAUTH, response);
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
            "PRIMARY KEY (email));", function(err){
            if(err) throw err;
        });
        connection.query("CREATE TABLE IF NOT EXISTS user_data(" +
            "user VARCHAR (" + db_field_size.email + ")," +
            "app VARCHAR (" + db_field_size.app + ")," +
            "field VARCHAR (" + db_field_size.field + ")," +
            "data TEXT (" + db_field_size.data + ")," +
            "PRIMARY KEY (user, app, field));", function(err){
            if(err) throw err;
        });
        connection.query("CREATE TABLE IF NOT EXISTS groups(" +
            "name VARCHAR (" + db_field_size.groupname + ")," +
            "app VARCHAR (" + db_field_size.app + ")," +
            "password VARCHAR (" + db_field_size.password + ")," +
            "host VARCHAR (" + db_field_size.email + ")," +
            "PRIMARY KEY (name));", function(err){
            if(err) throw err;
        });
        connection.query("CREATE TABLE IF NOT EXISTS inputs(" +
            "groupname VARCHAR (" + db_field_size.groupname + ")," +
            "user VARCHAR (" + db_field_size.email + ")," +
            "input TEXT (" + db_field_size.input + ")," +
            "time VARCHAR (" + db_field_size.time + "));",
            function(err){
                if(err) throw err;
            });
        connection.query("CREATE TABLE IF NOT EXISTS permissions(" +
            "groupname VARCHAR (" + db_field_size.groupname + ")," +
            "user VARCHAR (" + db_field_size.email + ")," +
            "field VARCHAR (" + db_field_size.field + ")," +
            "PRIMARY KEY (groupname, user, field));", function(err){
            if(err) throw err;
        });
        connection.query("CREATE TABLE IF NOT EXISTS updates(" +
            "groupname VARCHAR (" + db_field_size.groupname + ")," +
            "user VARCHAR (" + db_field_size.email + ")," +
            "field VARCHAR (" + db_field_size.field + ")," +
            "PRIMARY KEY (groupname, user, field));", function(err){
            if(err) throw err;
        });
        connection.query("CREATE TABLE IF NOT EXISTS group_data(" +
            "groupname VARCHAR (" + db_field_size.groupname + ")," +
            "field VARCHAR (" + db_field_size.field + ")," +
            "data TEXT (" + db_field_size.data + ")," +
            "PRIMARY KEY (groupname, field));", function(err){
            if(err) throw err;
        });
        connection.query("CREATE TABLE IF NOT EXISTS members(" +
            "groupname VARCHAR (" + db_field_size.groupname + ")," +
            "user VARCHAR (" + db_field_size.email + ")," +
            "PRIMARY KEY (groupname, user));", function(err){
            if(err) throw err;
        });
    }

    function _processRequest(request, response){
        var data = "";
        request.on("data", function(chunk){
            data += chunk;
        });
        request.on("end", function(){
            var auth_header = request.headers['authorization'];
            var credentials;
            if(auth_header !== undefined) credentials = new Buffer(auth_header.split(' ')[1], 'base64').toString().split(':');
            var parsed_url = url.parse(request.url, true);
            switch(parsed_url.pathname){
                case "/users":
                    switch(request.method){
                        case "HEAD":
                            _checkUser(
                                parsed_url.query.email,
                                response);
                            break;
                        case "POST":
                            _register(
                                credentials[0],
                                credentials[1],
                                response);
                            break;
                        case "GET":
                            _login(
                                credentials[0],
                                credentials[1],
                                response);
                            break;
                        case "DELETE":
                            _unregister(
                                credentials[0],
                                credentials[1],
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
                                credentials[0],
                                credentials[1],
                                data,
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
                                credentials[0],
                                credentials[1],
                                parsed_url.query.app,
                                parsed_url.query.field,
                                data,
                                response);
                            break;
                        case "GET":
                            _getData(
                                credentials[0],
                                credentials[1],
                                parsed_url.query.app,
                                parsed_url.query.field,
                                response);
                            break;
                        case "DELETE":
                            _deleteData(
                                credentials[0],
                                credentials[1],
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
                                credentials[0],
                                credentials[1],
                                decodeURIComponent(parsed_url.query.group),
                                decodeURIComponent(parsed_url.query.app),
                                data,
                                response);
                            break;
                        case "GET":
                            _listGroups(
                                decodeURIComponent(parsed_url.query.app),
                                response);
                            break;
                        case "DELETE":
                            _closeGroup(
                                credentials[0],
                                credentials[1],
                                decodeURIComponent(parsed_url.query.group),
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
                                credentials[0],
                                credentials[1],
                                decodeURIComponent(parsed_url.query.group),
                                decodeURIComponent(parsed_url.query.email),
                                response);
                            break;
                        case "GET":
                            _listMembers(
                                decodeURIComponent(parsed_url.query.group),
                                response);
                            break;
                        case "DELETE":
                            _removeMember(
                                credentials[0],
                                credentials[1],
                                decodeURIComponent(parsed_url.query.group),
                                decodeURIComponent(parsed_url.query.email),
                                response);
                            break;
                        default:
                            _finishResponse(501, response);
                    }
                    break;
                case "/groups/data":
                    switch(request.method){
                        case "POST":
                            _submitUpdate(
                                credentials[0],
                                credentials[1],
                                decodeURIComponent(parsed_url.query.group),
                                decodeURIComponent(parsed_url.query.field),
                                data,
                                response
                            );
                            break;
                        case "GET":
                            _getGroupData(
                                credentials[0],
                                credentials[1],
                                decodeURIComponent(parsed_url.query.group),
                                decodeURIComponent(parsed_url.query.field),
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
                                credentials[0],
                                credentials[1],
                                parsed_url.query.group,
                                parsed_url.query.email,
                                parsed_url.query.field,
                                response
                            );
                            break;
                        case "DELETE":
                            _revokePermission(
                                credentials[0],
                                credentials[1],
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
                                credentials[0],
                                credentials[1],
                                decodeURIComponent(parsed_url.query.group),
                                data,
                                response
                            );
                            break;
                        case "GET":
                            _listenInputs(
                                credentials[0],
                                credentials[1],
                                decodeURIComponent(parsed_url.query.group),
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
                                credentials[0],
                                credentials[1],
                                decodeURIComponent(parsed_url.query.group),
                                response
                            );
                            break;
                    }
                default:
                    _finishResponse(400, response);
            }
        });
    }

    function _checkCredentials(email, password, response, callback){
        connection.query("SELECT password FROM users WHERE email = ?;", [email], function(err, result){
            if(err) _finishResponse(K.ERROR, response, err.toString());
            else if(result.length === 0) _finishResponse(K.INVALID, response);
            else if(result[0].password !== password) _finishResponse(K.UNAUTH, response);
            else callback();
        });
    }

    function _finishResponse(status, response, body){
        response.writeHead(status);
        response.end(JSON.stringify(body));
    }
})();

K.server.listen(port);

//TODO: list groups member is in
//TODO: safer update/input clearing
