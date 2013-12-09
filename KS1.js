/**
 * Created by Patrick Feeney on 12/6/13.
 * Modified from previous version by Ben Carlson
 */

//region constants
var db_config = {
    host: "localhost",
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