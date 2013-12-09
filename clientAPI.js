var serverUrl;
var appName
var sessionKey;
var matchKey;
var matchMessageParser;
var username;
var password

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
	sendAjaxRequest("POST", JSON.stringify(request), callback, true);
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
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback), false);
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
	xmlhttp.open(serverUrl, serverUrl, false);
	xmlhttp.send(request);
	return returnVal;
}

function registerUsername(userName, password, email, successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
	"Functionname":"register",
	"Username":userName,
	"Password":password,
	"Email":email
	};
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback), false);
}

function deleteUsername(userName, password, successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
	"FunctionName":"unregister",
	"Username":userName,
	"Password":password
	};
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback), false);
}

function recoverFromUserName(userName, successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
	"FunctionName":"recover_from_username",
	"Username":userName
	};
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback), false);
}

function recoverFromEmail(email, successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
	"FunctionName":"recover_from_email",
	"Email":email
	};
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback), false);
}

function getUsername(email, successCallback, errorCallback)
{
	//create the json object that represents this request
	var request = {
	"FunctionName":"get_user",
	"Email":email
	};
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback), false);
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
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback), false);
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
	sendAjaxRequest("POST", JSON.stringify(request), callback, false);
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
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback), false);
}

//returns JSON
//result (success or failure) failure cases: unauthorized | invalid
//data

function sendAjaxRequest(requestType, field, successCallback, timeout)
{
	//add the server url in here somewhere
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = callbackFork;
    xmlhttp.withCredentials = true;
    xmlhttp.ontimeout = function(){successCallback(JSON.stringify({"success": false, "Error": "timeout"}))};
    if(timeout)
    {
        xmlhttp.timeout = 2500;
    }
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
				// response should be JSOM
				if(xmlhttp.checkReadyState)
				successCallback(JSON.parse(xmlhttp.responceText));
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
	sendAjaxRequest("POST", JSON.stringify(request), callback, false);
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
	sendAjaxRequest("POST", JSON.stringify(request), matchMessageParser, false);
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
	sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback), false);
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
    sendAjaxRequest("POST", JSON.stringify(request), matchMessageParser, false);
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
    sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback), false);
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
    sendAjaxRequest("POST", JSON.stringify(request), callback, false);
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
    sendAjaxRequest("POST", JSON.stringify(request), buildDefaultCallback(successCallback, errorCallback), false);
}