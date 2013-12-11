//region
var server_address;
var appname;
var username;
var password;
// endregion

//region node.js modules
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
//endregion

//region test calls

function dummyCallback(response){
    console.log("callback returned with " + response.result);
    if(response.reason !== undefined) console.log("reason was " + response.reason);
    if(response.data !== undefined) console.log("data is " + response.data);
}

setServer("http://127.0.0.1:1337/", function(response){
    dummyCallback(response);
    register("testname", "testpass", "testmail", function(response){
        dummyCallback(response);
        login("testname", "testpass", "testapp", function(response){
            dummyCallback(response);
            postData("testfield", "testdata", function(response){
                dummyCallback(response);
                getData("testfield", function(response){
                    dummyCallback(response);
                    unregister(dummyCallback);
                });
            });
        });
    });
});

setTimeout(function(){}, 10000);

//endregion
function sendRequest(body, callback) {
    var request = new XMLHttpRequest();
    request.onreadystatechange = function(){
        if(request.readyState == 4) {
            console.log(request.responseText);
            callback(JSON.parse(request.responseText));
        }
    };
    request.open("POST", server_address, true);
    request.send(JSON.stringify(body));
}

function setServer(address, callback) {
    var request = new XMLHttpRequest();
    console.log("attempting to contact server");
    request.onreadystatechange = function(){
        if(request.readyState == 4 && JSON.parse(request.responseText).result !== undefined){
            console.log("contact established");
            server_address = address;
            callback(JSON.parse(request.responseText));
        }
    }
    request.open("POST", address, false);
    request.send(JSON.stringify({"functionname": "handshake"}));
}

function login(username, password, appname, callback) {
    console.log("attempting to log in");
    sendRequest({
        "functionname": "checkCredentials",
        "username": username,
        "password": password
    }, function(response){
        if(response.result === "success"){
            console.log("setting local username and password variables");
            this.username = username;
            this.password = password;
            console.log("username is " + this.username + ", password is " + this.password);
        }
        this.appname = appname;
        callback(response);
    })
}

function register(username, password, email, callback) {
    console.log("attempting to register user");
    sendRequest({
        "functionname":"register",
        "username": username,
        "password": password,
        "email":email
    }, callback(response));
}

function unregister(callback) {
    sendRequest({
        "functionname":"unregister",
        "username": this.username,
        "password": this.password
    }, callback(response));
}

function recoverFromUsername(username, callback) {
    sendRequest({
        "functionname":"recoverFromUsername",
        "username": username
    }, callback(response));
}

function recoverFromEmail(email, callback) {
    sendRequest({
        "functionname":"recoverFromEmail",
        "email": email
    }, callback(response));
}

function postData(fieldname, data, callback) {
    console.log("attempting to post data");
    sendRequest({
        "functionname":"postData",
        "username": this.username,
        "password": this.password,
        "appname": this.appname,
        "fieldname": fieldname,
        "data": data
    }, callback(response));
}

function getData(fieldname, callback) {
    console.log("attempting to get data");
    sendRequest({
        "functionname":"getData",
        "username": this.username,
        "password": this.password,
        "appname": this.appname,
        "fieldname": fieldname
    }, callback(response));
}

function deleteData(fieldname, callback) {
    console.log("attempting to delete data");
    sendRequest({
        "functionname":"deleteData",
        "username": this.username,
        "password": this.password,
        "appname": this.appname,
        "fieldname": fieldname
    }, callback(response));
}

/*
var serverUrl;
var appName;
var sessionKey;
var matchKey;
var matchMessageParser;
var username;
var password;

function login(newUsername, newPassword, whichAppName, successCallback, errorCallback)
{
    appName = whichAppName;
    username = newUsername;
    password = newPassword;
	//create the json object that represents this request
	var request = {
	"FunctionName":"login",
	"Username":username,
	"Password":password
	};
	function callback(retVal)
	{
		if(retVal.success)
		{
			document.cookie="key=" + retVal.key;
			successCallback();
		}
		else
		{
			errorCallback(retVal.Error);
		}
	}
	sendAjaxRequest("POST", JSON.stringify(request), callback);
}

function loginFromCookie(whichAppName)
{
    appName = whichAppName;
    sessionKey = document.cookie.substring(document.cookie.indexOf("key="), document.cookie.indexOf(";")); //might need to fix this line
}

function logout(successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
	"FunctionName":"logout",
    "Username":username,
    "Password":password,
    "SessionKey":sessionKey
	};
    function callback(retVal)
    {
        if(retVal.success)
        {
            document.cookie="key=";
            successCallback();
        }
        else
        {
            errorCallback(retVal.Error);
        }
    }
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback));
}

function setServerUrl(newUrl)
{
	serverUrl = newUrl;
	var returnVal = false;
	var request = {
	"FunctionName":"handshake"
	};
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange= function() {returnVal = true};
	xmlhttp.open(request, serverUrl, false);
	xmlhttp.send(field);
	return returnVal;
}

function registerUsername(userName, password, email, successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
	"functionname":"register",
	"username":userName,
	"password":password,
	"email":email
	};
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback));
}

function deleteUsername(userName, password, successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
	"functionname":"unregister",
	"username":userName,
	"password":password
	};
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback));
}

function recoverFromUserName(userName, successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
	"functionname":"recoverFromUsername",
	"username":userName
	};
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback));
}

function recoverFromEmail(email, successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
	"functionname":"recoverFromEmail",
	"email":email
	};
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback));
}

function getUsername(email, successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
	"FunctionName":"get_user",
	"Email":email
	};
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback));
}

function postData(key, data, successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
		"FunctionName": "post_data",
        "Username":username,
        "Password":password,
		"SessionKey": sessionKey,
		"AppName": appName,
		"Key": key,
		"Data": data
		};
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback));
}

//returns JSON
//result (success or failure) failure cases: unauthorized
//data 

function getData(key, successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
		"FunctionName": "get_data",
        "Username":username,
        "Password":password,
		"SessionKey": sessionKey,
		"AppName": appName,
		"Key": key
		};
	function callback(retVal)
	{
		if(retVal.success)
		{
			successCallback(retVal.Data);
		}
		else
		{
			errorCallback(retVal.Error);
		}
	}
	sendAjaxRequest("POST", JSON.stringify(request), callback);
}

//returns JSON
//result (success or failure) failure cases: unauthorized | invalid
//data 

function deleteData(key, successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
		"FunctionName": "delete_data",
        "Username":username,
        "Password":password,
		"SessionKey": sessionKey,
		"AppName": appName,
		"Key": key
		};
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback));
}

//returns JSON
//result (success or failure) failure cases: unauthorized | invalid
//data

function sendAjaxRequest(requestType, field, successCallback)
{
	//add the server url in here somewhere
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = callbackFork;
    xmlhttp.withCredentials = true;
	xmlhttp.open(requestType, serverUrl, true);
	xmlhttp.send(field);

	function callbackFork()
	{
		switch(xmlhttp.readyState)
		{
			case 1:
				// do nothing
				break;
			case 2:
				// do nothing
				break;
			case 3:
				// do nothing
				break;
			case 4:
				// response should be JSON
				if(xmlhttp.checkReadyState)
				successCallback(JSON.parse(xmlhttp.responseText));
		}
	}
}

//this should be used for any calls that don't have a return value on a success
function buildDefaultCallback(successCallback, errorCallback)
{
	return function (retVal)
	{
		if(retVal.success)
		{
			successCallback();
		}	
		else
		{
			errorCallback(retVal.Error);
		}
	}
}

//multiplayer functionality

function setAsHost(matchName, matchPassword, successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
		"FunctionName": "StartMatch",
        "Username":username,
        "Password":password,
		"SessionKey": sessionKey,
		"AppName": appName,
		"MatchName": matchName,
		"MatchPassword": matchPassword
		};
    function callBack(retVal)
    {
        if(retVal.success)
        {
            keepListening();
            matchKey = retVal.matchKey;
            successCallback();
        }
        else
        {
            errorCallback(retVal.Error);
        }
    }
	sendAjaxRequest("POST", JSON.stringify(request), callback);
}

function joinMatch(matchName, matchPassword, successCallback, errorCallback, messageParser, messageErrorHandler)
{
	//create the json object that represents this request
	var request = {
		"FunctionName": "join_match",
        "Username":username,
        "Password":password,
		"SessionKey": sessionKey,
		"appName": appName,
        "matchName": matchName,
        "matchPassword": matchPassword
		};
    function callBack(retVal)
    {
        if(retVal.success)
        {
            keepListening();
            matchKey = retVal.matchKey;
            successCallback();
        }
        else
        {
            errorCallback(retVal.Error);
        }
    }
    matchMessageParser = function(retVal)
    {
        if(retVal.success)
        {
            keepListening();
            messageParser(retVal.Message);
        }
        else
        {
            messageErrorHandler(retVal.Error);
        }
    }
	sendAjaxRequest("POST", JSON.stringify(request), matchMessageParser);
}

function leaveMatch(successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
		"FunctionName": "leave_session",
        "Username":username,
        "Password":password,
		"AppName":appName,
		"SessionKey": sessionKey,
        "MatchKey": matchKey
		};
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback));
}

function keepListening() //the app doesn't need to call this directly
{
    //create the json object that represents this request
    var request = {
        "FunctionName": "keepListening",
        "Username":username,
        "Password":password,
        "SessionKey": sessionKey,
        "AppName":appName,
        "MatchKey": matchKey
    };
    sendAjaxRequest("POST", JSON.stringify(request), matchMessageParser);
}

//empty list indicates anyone can access
function postDataToMatch(key, data, allowedReaders, successCallback, errorCallback)
{
    //create the json object that represents this request
    var request = {
        "FunctionName": "PostDataToMatch",
        "Username":username,
        "Password":password,
        "SessionKey": sessionKey,
        "AppName": appName,
        "MatchKey": matchKey,
        "AllowedReaders": allowedReaders,
        "Key": key,
        "Data": data
    };
    sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback));
}

function getDataFromMatch(key, successCallback, errorCallback)
{
    //create the json object that represents this request
    var request = {
        "FunctionName": "GetDataFromMatch",
        "Username":username,
        "Password":password,
        "SessionKey": sessionKey,
        "AppName": appName,
        "MatchKey": matchKey,
        "Key": key
    };
    function callback(retVal)
    {
        if(retVal.success)
        {
            successCallback(retVal.Data);
        }
        else
        {
            errorCallback(retVal.Error)
        }
    }
    sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback));
}

function sendMessage(message, allowedReaders, successCallback, errorCallback)
{
    //create the json object that represents this request
    var request = {
        "FunctionName": "SendMessage",
        "Username":username,
        "Password":password,
        "SessionKey": sessionKey,
        "AppName": appName,
        "MatchKey": matchKey,
        "AllowedReaders": allowedReaders,
        "Message": message
    };
    sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback));
}
*/ //old code