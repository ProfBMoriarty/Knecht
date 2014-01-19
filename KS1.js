/**
 * Created by Patrick Feeney on 12/6/13.
 * Modified from previous version by Ben Carlson
 */

//region constants
var db_config = {
    host: "localhost",var K = {};
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
        userlist: 0xffffff,
        input: 0xffffff,
        time: 64
    };
    //endregion

    //region Globals
    var mysql = require("mysql");
    var url = require("url");
    var http = require("http");

    var connection;
    //endregion

    //region Initialization
    _connect();
    console.log("dropping db for clean testing. Remove this in final version")
    connection.query("DROP DATABASE IF EXISTS knecht");
    _initDatabase();
    K.server = http.createServer(_processRequest);
    //endregion

    //region Users Functions
    function _checkUser(email, response){
        connection.query("SELECT 1 FROM users WHERE email = ?;", [email], function(err, result){
            if(err) _finishResponse(500, response, err.toString());
            else if(result[0] === undefined) _finishResponse(404, response);
            else _finishResponse(200, response);
        });
    }

    function _register(email, password, response){
        connection.query("INSERT INTO users VALUES (?, ?);", [email, password], function(err){
            if(err) {
                if(err.code == "ER_DUP_ENTRY") _finishResponse(403, response);
                else _finishResponse(500, response, err.toString());
            }
            else _finishResponse(200, response);
        });
    }

    function _login(email, password, response){
        _checkCredentials(email, password, function(){
            _finishResponse(200, response);
        });
    }

    function _recoverPassword(email, response){
        connection.query("SELECT 1 FROM users WHERE email = ?;", [email], function(err, result){
            if(err) _finishResponse(500, response, err.toString());
            else if(result[0] === undefined) _finishResponse(404, response);
            else {
                //TODO: send recovery email
                _finishResponse(200, response);
            }
        });
    }

    function _changePassword(email, password, new_password, response){
        _checkCredentials(email, password, response, function(){
            connection.query("UPDATE users SET password = ? WHERE email = ?;", [new_password, email], function(err){
                if(err) _finishResponse(500, response, err.toString());
                else _finishResponse(200, response);
            });
        });
    }

    function _unregister(email, password, response){
        _checkCredentials(email, password, response, function(){
            connection.query("DELETE FROM users WHERE email = ?;", [email], function(err){
                if(err) _finishResponse(500, response, err.toString());
                else connection.query("DELETE FROM user_data WHERE user = ?;", [email], function(err){
                    if(err) _finishResponse(500, response, err.toString());
                    else _finishResponse(200, response);
                });
            });
        });
    }
    //endregion

    //regions Users/Data functions

    function _putData(email, password, app, field, data, response){
        console.log("putting data: " + data);
        _checkCredentials(email, password, response, function(){
            connection.query("INSERT INTO user_data VALUES (?, ?, ?, ?)" +
                "ON DUPLICATE KEY UPDATE data = ?;", [email, app, field, data, data], function(err){
                if(err) _finishResponse(500, response, err.toString());
                else _finishResponse(200, response);
            });
        });
    }

    function _getData(email, password, app, field, response){
        _checkCredentials(email, password, response, function(){
            connection.query("SELECT data FROM user_data WHERE user = ? AND app = ? AND field = ?;", [email, app, field], function(err, result){
                if(err) _finishResponse(500, response, err.toString());
                else if (result[0] === undefined) _finishResponse(404, response);
                else _finishResponse(200, response, result[0].data);
            });
        });
    }

    function _deleteData(email, password, app, field, response){
        _checkCredentials(email, password, response, function(){
            connection.query("DELETE FROM user_data WHERE user = ? AND app = ? AND field = ?;", [email, app, field], function(err){
                if(err) _finishResponse(500, response, err.toString());
                else _finishResponse(200, response);
            });
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
            "password VARCHAR (" + db_field_size.password + ")," +
            "app VARCHAR (" + db_field_size.app + ")," +
            "users TEXT (" + db_field_size.userlist + ")," +
            "PRIMARY KEY (name));", function(err){
            if(err) throw err;
        });
        connection.query("CREATE TABLE IF NOT EXISTS inputs(" +
            "groupname VARCHAR (" + db_field_size.groupname + ")," +
            "user VARCHAR (" + db_field_size.email + ")," +
            "input TEXT (" + db_field_size.input + ")," +
            "time TEXT (" + db_field_size.time + "));",
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
                            _checkUser(parsed_url.query.email, response);
                            break;
                        case "POST":
                            _register(credentials[0], credentials[1],response);
                            break;
                        case "GET":
                            _login(credentials[0], credentials[1],response);
                            break;
                        case "RECOVER":
                            _recoverPassword(parsed_url.query.email, response);
                            break;
                        case "PATCH":
                            _changePassword(credentials[0], credentials[1], data, response);
                            break;
                        case "DELETE":
                            _unregister(credentials[0], credentials[1], response);
                            break;
                        default:
                            _finishResponse(501, response);
                    }
                    break;
                case "/users/data":
                    switch(request.method){
                        case "PUT":
                            _putData(credentials[0], credentials[1], parsed_url.query.app, parsed_url.query.field, data, response);
                            break;
                        case "GET":
                            _getData(credentials[0], credentials[1], parsed_url.query.app, parsed_url.query.field, response);
                            break;
                        case "DELETE":
                            _deleteData(credentials[0], credentials[1], parsed_url.query.app, parsed_url.query.field, response);
                            break;
                        default:
                            _finishResponse(501, response);
                    }
                    break;
                default:
                    _finishResponse(400, response);
            }
        });
    }

    function _checkCredentials(email, password, response, callback){
        connection.query("SELECT 1 FROM users WHERE email = ? AND password = ?;", [email, password], function(err, result){
            if (err) _finishResponse(500, response, err.toString());
            else if (result[0] === undefined) _finishResponse(401, response);
            else callback();
        });
    }

    function _finishResponse(status, response, body){
        response.writeHead(status);
        response.end(body);
    }
})();

K.server.listen(port);
    user: "root",
    password:"root"
};

var reconnect_delay = 2000;

var username_length = 100;
var password_length = 100;
var email_length = 100;
var appname_length = 100;
var fieldname_length = 100;
var data_length = 100;
var matchname_length = 100;
var authed_length = 100;

var matchhost_field = "~knecht_match_host";
var matchpass_field = "~knecht_match_pass";
var matchusers_field = "~knecht_match_users";
//endregion

//region node.js modules
var http = require("http");
var mysql = require("mysql");
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
//endregion

//region globals
var connection;
var request_queues = new Array(new Array());
//endregion

//region main

//region initialize database
connect();
connection.query("CREATE DATABASE IF NOT EXISTS knecht;", function(err){
    if(err) throw err;
});
connection.query("USE knecht", function(err){
    if(err) throw err;
});

//region drop the tables to make sure the test code is working fresh. delete later
connection.query("DROP TABLE users", function(){});
connection.query("DROP TABLE data", function(){});
connection.query("DROP TABLE shared", function(){});
//endregion

connection.query("CREATE TABLE IF NOT EXISTS users(" +
    "username VARCHAR(" + username_length + ")," +
    "password VARCHAR(" + password_length + ")," +
    "email VARCHAR("    + email_length    + ")," +
    "UNIQUE (username)," +
    "PRIMARY KEY (email));", function(err){
    if(err) throw err;
});
connection.query("CREATE TABLE IF NOT EXISTS data(" +
    "username VARCHAR(" + username_length + ")," +
    "appname VARCHAR("  + appname_length  + ")," +
    "fieldname VARCHAR("      + fieldname_length      + ")," +
    "data VARBINARY("     + data_length     + ")," +
    "PRIMARY KEY (username, appname, fieldname));", function(err){
    if(err) throw err;
});

connection.query("CREATE TABLE IF NOT EXISTS shared(" +
    "matchname VARCHAR(" + matchname_length + ")," +
    "authed VARBINARY("  + authed_length  + ")," +
    "fieldname VARCHAR("      + fieldname_length      + ")," +
    "data VARBINARY("     + data_length     + ")," +
    "PRIMARY KEY (matchname, fieldname));", function(err){
    if(err) throw err;
});
//endregion

http.createServer(function(request, response){
    if(request.method === "POST"){
        console.log("post request received");
        var data = "";
        request.on("data", function(chunk){
            data += chunk;
        });
        request.on("end", function(){
            var obj = JSON.parse(data);
            console.log(obj);
            processPost(obj, response);
        });
    }
    else{
        finishResponse(403, "text/plain", "Just what are you trying to pull here?", response);
    }
}).listen(1337, "127.0.0.1");

function processPost(obj, response){
    switch(obj.functionname){
        case "checkCredentials":
            checkCredentials(obj.username, obj.password, response);
            break;
        case "handshake":
            finishResponse(200, "application/json", JSON.stringify({"result": "success"}), response);
            break;
        case "register":
            register(obj.username, obj.password, obj.email, response);
            break;
        case "unregister":
            unregister(obj.username, obj.password, response);
            break;
        case "recoverFromUsername":
            recoverFromUsername(obj.username, response);
            break;
        case "recoverFromEmail":
            recoverFromEmail(obj.email, response);
            break;
        case "postData":
            postData(obj.username, obj.password, obj.appname, obj.fieldname, obj.data, response);
            break;
        case "getData":
            getData(obj.username, obj.password, obj.appname, obj.fieldname, response);
            break;
        case "deleteData":
            deleteData(obj.username, obj.password, obj.appname, obj.fieldname, response);
            break;
        /*case "createMatch":
            createMatch(obj.username, obj.password, obj.matchname, obj.matchpass, response);
            break;
        case "joinMatch":
            joinMatch(obj.username, obj.password, obj.matchname, obj.matchpass, response);
            break;
        case "submitInput":
            submitInput(obj.username, obj.password, obj.matchname, obj.inputname, obj.inputdata, response);
            break;
        case "subscribeUpdate":
            subscribeUpdate(obj.username, obj.password, obj.matchname, response);
            break;*/ //unimplemented multiplayer functions
        default:
            finishResponse(400, "text/plain", "Not on the menu, chief", response);
            break;
    }
}

function finishResponse(code, content_type, body, response){
    response.writeHead(code, {"Content-Type": content_type});
    response.end(body);
}

function respondError(err, response){
    finishResponse(404, "application/json",
        JSON.stringify({"result": "failure", "reason": err.toString()}), response);
    throw err;
}

//endregion

//region single-user functions
function checkCredentials(username, password, response){
    connection.query("SELECT 1 FROM users WHERE username = ? AND password = ?;", [username, password], function(err, result){
        if(err) respondError(err, response);
        if(result[0] === undefined){
            finishResponse(403, "application/json",
                JSON.stringify({"result": "failure", "reason": "invalid credentials"}), response);
            console.log("Error: invalid credentials");
        }
        else {
            finishResponse(200, "application/json",
                JSON.stringify({"result": "success"}), response);
            console.log("Success: credentials check out");
        }
    });
}
function register(username, password, email, response){
    connection.query("INSERT INTO users VALUES (?, ?, ?);", [username, password, email], function(err){
        if(err) {
            if(err.code == "ER_DUP_ENTRY"){
                finishResponse(403, "application/json",
                    JSON.stringify({"result": "failure", "reason": "username or email already in use"}), response);
                console.log("Error: username or email already in use");
            }
            else {
                respondError(err, response);
            }
        }
        else {
            console.log("sending register response");
            finishResponse(200, "application/json",
                JSON.stringify({"result": "success"}), response);
            console.log("Success: user created");
        }
    });
}

function unregister(username, password, response){
    connection.query("SELECT 1 FROM users WHERE username = ? AND password = ?;", [username, password], function(err, result){
        if(err) respondError(err, response);
        if(result[0] === undefined){
            finishResponse(403, "application/json",
                JSON.stringify({"result": "failure", "reason": "invalid credentials"}), response);
            console.log("Error: invalid credentials");
        }
        else {
            connection.query("DELETE FROM users WHERE username = ?;", [username], function(err){
                if(err) respondError(err, response);
            });
            connection.query("DELETE FROM data WHERE username = ?;", [username], function(err){
                if(err) respondError(err, response);
            });
            finishResponse(200, "application/json",
                JSON.stringify({"result": "success"}), response);
            console.log("Success: user data deleted");
        }
    });
}

function recoverFromUsername(username,response){
    connection.query("SELECT password, email FROM users WHERE username = ?;", [username], function(err, result){
        if(err) respondError(err, response);
        if(result[0] === undefined){
            finishResponse(404, "application/json",
                JSON.stringify({"result": "failure", "reason": "user not found"}), response);
            console.log("Error: user not found");
        }
        else {
            //TODO: send password recovery email
            finishResponse(200, "application/json",
                JSON.stringify({"result": "success"}), response);
            console.log("Success: recovery email sent");
        }
    });
}

function recoverFromEmail(email, response){
    connection.query("SELECT password FROM users WHERE email = ?;", [email], function(err, result){
        if(err) respondError(err, response);
        if(result[0] === undefined) {
            finishResponse(404, "application/json",
                JSON.stringify({"result": "failure", "reason": "user not found"}), response);
            console.log("Error: user not found");
        }
        else {
            //TODO: send password recovery email
            finishResponse(200, "application/json",
                JSON.stringify({"result": "success"}), response);
            console.log("Success: recovery email sent");
        }
    });
}

function postData(username, password, appname, fieldname, data, response){
    connection.query("SELECT 1 FROM users WHERE username = ? AND password = ?", [username, password], function(err, result){
        if(err) respondError(err, response);
        if(result[0] === undefined) {
            finishResponse(403, "application/json",
                JSON.stringify({"result": "failure", "reason": "invalid credentials"}), response);
            console.log("Error: invalid credentials");
        }
        else connection.query("INSERT INTO data VALUES (?, ?, ?, ?)" +
            "ON DUPLICATE KEY UPDATE data = ?", [username, appname, fieldname, data, data], function(err){
            if(err) respondError(err, response);
            finishResponse(200, "application/json",
                JSON.stringify({"result": "success"}), response);
            console.log("Success: data posted");
        });
    });
}

function getData(username, password, appname, fieldname, response){
    connection.query("SELECT 1 FROM users WHERE username = ? AND password = ?", [username, password], function(err, result){
        if(err) respondError(err, response);
        if(result[0] === undefined) {
            finishResponse(403, "application/json",
                JSON.stringify({"result": "failure", "reason": "invalid credentials"}), response);
            console.log("Error: invalid credentials");
        }
        else connection.query("SELECT data FROM data WHERE username = ? AND appname = ? AND fieldname = ?;",
            [username, appname, fieldname], function(err, result){
                if(err) respondError(err, response);
                if(result[0] === undefined) {
                    finishResponse(404, "application/json",
                        JSON.stringify({"result": "failure", "reason": "data not found"}), response);
                    console.log("Error: no data");
                }
                else {
                    finishResponse(200, "application/json",
                        JSON.stringify({"result": "success", "data": result[0]}), response);
                    console.log("data is " + result[0].data.toString());
                }
            });
    });
}

function deleteData(username, password, appname, fieldname, response){
    connection.query("SELECT 1 FROM users WHERE username = ? AND password = ?", [username, password], function(err, result){
        if(err) respondError(err, response);
        if(result[0] === undefined) {
            finishResponse(403, "application/json",
                JSON.stringify({"result": "failure", "reason": "invalid credentials"}), response);
            console.log("Error: invalid credentials");
        }
        else connection.query("DELETE FROM data WHERE username = ? AND appname = ? AND fieldname = ?;",
            [username, appname, fieldname], function(err, result){
                if(err) respondError(err, response);
                if(result[0] === undefined) {
                    finishResponse(404, "application/json",
                        JSON.stringify({"result": "failure", "reason": "data not found"}), response);
                    console.log("Error: no data");
                }
                else {
                    finishResponse(200, "application/json",
                        JSON.stringify({"result": "success"}), response);
                    console.log("Success: data deleted");
                }
            });
    });
}
//endregion

//region shared-data functions

function createMatch(username, password, matchname, matchpass, response){
    connection.query("SELECT 1 FROM users WHERE username = ? AND password = ?", [username, password], function(err, result){
        if(err) respondError(err, response);
        if(result[0] === undefined) {
            finishResponse(403, "application/json",
                JSON.stringify({"result": "failure", "reason": "invalid credentials"}), response);
            console.log("Error: invalid credentials");
        }
        else connection.query("SELECT 1 FROM shared WHERE matchname = ?;", [matchname], function(){
            if(err) respondError(err, response);
            if(result[0] !== undefined) {
                finishResponse(403, "application/json",
                    JSON.stringify({"result": "failure", "reason": "matchname in use"}), response);
                console.log("Error: invalid credentials");
            }
            else {
                connection.query("INSERT INTO shared VALUES (?, ?, ?, ?)", [matchname, [username], matchhost_field, username], function(err){
                    if(err) respondError(err, response);
                });
                connection.query("INSERT INTO shared VALUES (?, ?, ?, ?)", [matchname, [username], matchpass_field, matchpass], function(err){
                    if(err) respondError(err, response);
                });
                connection.query("INSERT INTO shared VALUES (?, ?, ?, ?)", [matchname, [username], matchusers_field, [username]], function(err){
                    if(err) respondError(err, response);
                });
                finishResponse(200, "application/json",
                    JSON.stringify({"result": "success"}, response));
                console.log("Success: match created");
            }
        });
    })
}

function joinMatch(username, password, matchname, matchpass, response){
    connection.query("SELECT 1 FROM users WHERE username = ? AND password = ?", [username, password], function(err, result){
        if(err) respondError(err, response);
        if(result[0] === undefined) {
            finishResponse(403, "application/json",
                JSON.stringify({"result": "failure", "reason": "invalid credentials"}), response);
            console.log("Error: invalid credentials");
        }
        else connection.query("SELECT 1 FROM shared WHERE matchname = ? AND fieldname = ? AND data = ?",
            [matchname, matchpass_field, matchpass], function(err, result){
            if(err) respondError(err, response);
            if(result[0] === undefined) {
                finishResponse(403, "application/json",
                    JSON.stringify({"result": "failure", "reason": "invalid credentials"}), response);
                console.log("Error: invalid credentials");
            }
            else ; //TODO: implement this
        });
    });
}

function submitInput(username, password, matchname, input_type, input_data, response){
    connection.query("SELECT 1 FROM users WHERE username = ? AND password = ?", [username, password], function(err, result){
        if(err) respondError(err, response);
        if(result[0] === undefined) {
            finishResponse(403, "application/json",
                JSON.stringify({"result": "failure", "reason": "invalid credentials"}), response);
            console.log("Error: invalid credentials");
        }
        else ; //TODO: implement this
    });
}

//endregion

function connect(){ //recommended disconnect handling method from https://github.com/felix/node-mysql/blob/master/Readme.md
    connection = mysql.createConnection(db_config);
    connection.connect(function(err){
        if(err) {
            console.log("Error connecting to database: ", err);
            setTimeout(connect, reconnect_delay);
        }
    });
    connection.on("error", function(err){
        console.log("database error: ", err);
        if(err.code === "PROTOCOL_CONNECTION_LOST") connect();
        else throw err;
    });
}
