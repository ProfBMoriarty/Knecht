var K = {};

(function(){

    //region Globals
    var _address = null;
    var _app = null;
    var _email = null;
    var _password = null;

    var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
    //endregion

    //region Constants
    K.OK = "K.OK";
    K.ERROR = "K.ERROR";
    K.INVALID = "K.INVALID";
    //endregion

    //region Config Functions
    K.setAddress = function(address){
        _address = address;
    };

    K.setApplication = function(app){
        _app = app;
    };
    //endregion

    //region Users functions
    K.checkUser = function(email, callback){
        _sendRequest("HEAD", "/users?email=" + email, function(status){
            if(status == 200) callback(true);
            else if(status === 404) callback(false);
            else callback(K.ERROR);
        });
    };

    K.register = function(email, password, callback){
        _email = email;
        _password = password;
        _sendRequest("POST", "/users", function(status){
            if(status === 200) callback(K.OK);
            else if(status === 403) callback(K.INVALID);
            else callback(K.ERROR);
        });
    };

    K.login = function(email, password, callback){
        _email = email;
        _password = password;
        _sendRequest("GET", "/users", function(status){
            if(status === 200) callback(K.OK);
            else if(status === 401) callback(K.INVALID);
            else callback(K.ERROR);
        });
    };

    K.recoverPassword = function(email, callback){
        _sendRequest("RECOVER", "/users?email=" + email, function(status){
            if(status === 200) callback(K.OK);
            else if(status === 404) callback(K.INVALID);
            else callback(K.ERROR);
        });
    };

    K.changePassword = function(password, callback){
        _sendRequest("PATCH", "/users", function(status){
            if(status === 200) {
                _password = password;
                callback(K.OK);
            }
            else if(status === 401) callback(K.INVALID);
            else callback(K.ERROR);
        }, password);
    };

    K.unregister = function(callback){
        _sendRequest("DELETE", "/users", function(status){
            if(status === 200) callback(K.OK);
            else if(status === 401) callback(K.INVALID);
            else callback(K.ERROR);
        });
    };
    //endregion

    //region User Data functions

    K.putData = function(field, data, callback){
        _sendRequest("PUT", "/users/data?app=" + _app + "&field=" + field, function(status){
            if(status === 200) callback(K.OK);
            else if(status === 401) callback(K.INVALID);
            else callback(K.ERROR);
        }, JSON.stringify(data));
    };

    K.getData = function(field, callback){
        _sendRequest("GET", "/users/data?app=" + _app + "&field=" + field, function(status, result){
            if(status === 200) callback(JSON.parse(result));
            else if(status === 401) callback(K.INVALID);
            else if(status === 404) callback(undefined);
            else callback(K.ERROR);
        });
    };

    K.deleteData = function(field, callback){
        _sendRequest("DELETE", "/users/data?app=" + _app + "&field=" + field, function(status){
            if(status === 200) callback(K.OK);
            else if(status === 401) callback(K.INVALID);
            else callback(K.ERROR);
        });
    };
    //endregion

    function _sendRequest(method, path, callback, body){
        var request = new XMLHttpRequest();
        request.onreadystatechange = function(){
            if(request.readyState === request.DONE) {
                callback(request.status, request.responseText);
            }
        };
        request.open(method, _address + path, true, _email, _password);
        //request.withCredentials = true;
        request.send(body);
    }

    //host functions
    K.startGroup = function(groupName, groupPassword, callback){
        _sendRequest("POST", "/groups?app=" + _app + "&name=" + groupName, function(status){
            if(status === 200) callback(K.OK);
            else if(status === 401 || status === 403) callback(K.INVALID);
            else callback(K.ERROR);
        }, groupPassword);
    };

    K.closeGroup = function(groupName, callback) {
        _sendRequest("DELETE", "/groups?name=" + groupName, function(status){
            if(status === 200) callback(K.OK);
            else if(status === 401 || status === 403) callback(K.INVALID);
            else callback(K.ERROR);
        });
    };

    K.addMember = function(groupName, groupPassword, callback) {
        _sendRequest("POST", "/groups/members?name=" + groupName, function(status){
            if(status === 200) callback(K.OK);
            else if(status === 401 || status === 403) callback(K.INVALID);
            else callback(K.ERROR);
        });
    };

    K.listMember = function(groupName, callback) {
        _sendRequest("GET", "/groups/members?name=" + groupName, function(status){
            if(status === 200) callback(K.OK);
            else if(status === 401 || status === 403) callback(K.INVALID);
            else callback(K.ERROR);
        });
    };

    K.removeMember = function(groupName, callback) {
        _sendRequest("DELETE", "/groups/members?name=" + groupName, function(status){
            if(status === 200) callback(K.OK);
            else if(status === 401 || status === 403) callback(K.INVALID);
            else callback(K.ERROR);
        });
    };

    //TODO: escape ampersands (those assholes will put ampersands in their names)
    //TODO: set timeouts; listen should be a long time, others much shorter
    K.grantPermission = function(groupName, member, field, callback) {
        _sendRequest("POST", "/groups/permissions?name=" + groupName + "&member=" + member + "&field=" + field, function(status){
            if(status === 200) callback(K.OK);
            else if(status === 401 || status === 403) callback(K.INVALID);
            else callback(K.ERROR);
        });
    };

    K.revokePermission = function(groupName, member, field, callback) {
        _sendRequest("DELETE", "/groups/permissions?name=" + groupName + "&member=" + member + "&field=" + field, function(status){
            if(status === 200) callback(K.OK);
            else if(status === 401 || status === 403) callback(K.INVALID);
            else callback(K.ERROR);
        });
    };

    K.submitUpdate = function(groupName, field, data, callback) {
        _sendRequest("PUT", "/groups/data?name=" + groupName + "&field=" + field, function(status){
            if(status === 200) callback(K.OK);
            else if(status === 401 || status === 403) callback(K.INVALID);
            else callback(K.ERROR);
        }, JSON.stringify(data));
    };

    //this also a member function
    K.getGroupData = function(groupName, field, callback) {
        _sendRequest("GET", "/groups/data?name=" + groupName + "&field=" + field, function(status, result){
            if(status === 200) callback(JSON.parse(result));
            else if(status === 401 || status === 403) callback(K.INVALID);
            else if(status === 404) callback(undefined);
            else callback(K.ERROR);
        });
    };

    //TODO:add graceful disconnect function

    K.listenInputs = function(groupName, callback, acknowledgement) {
        _sendRequest("GET", "/groups/inputs?name=" + groupName, function(status, result){
            if(status === 200)
            {
                parsedResult = JSON.parse(result);
                callback(parsedResult);
                this.listenInputs(groupName, callback, parsedResult.timestamp)
            }
            else if(status === 401 || status === 403) callback(K.INVALID);
            else if(status === 404) callback(undefined);
            else callback(K.ERROR);
        }, JSON.stringify(acknowledgement));
    };

    //member functions
    K.submitInput = function(groupName, field, callback) {
        _sendRequest("PUT", "/groups/inputs?name=" + groupName + "&field=" + field, function(status){
            if(status === 200) callback(K.OK);
            else if(status === 401 || status === 403) callback(K.INVALID);
            else callback(K.ERROR);
        });
    };

    K.listenUpdates = function(groupName, callback, acknowledgement) {
        _sendRequest("GET", "/groups/updates?name=" + groupName, function(status, result){
            if(status === 200)
            {
                parsedResult = JSON.parse(result);
                callback(parsedResult);
                this.listenUpdates(groupName, callback, parsedResult.timestamp)
            }
            else if(status === 401 || status === 403) callback(K.INVALID);
            else if(status === 404) callback(undefined);
            else callback(K.ERROR);
        }, JSON.stringify(acknowledgement));
    };
})();

K.setAddress("http://localhost:8080");
K.setApplication("a");

K.register('e', 'p', function(result){
   dummyCallback(result); //done
    K.putData('f', 'Hello World', function(result){
        dummyCallback(result); //false
        K.getData('f', function(result){
            dummyCallback(result); //true
            K.deleteData('f', function(result){
                dummyCallback(result); //done
                K.getData('f', dummyCallback); //done
            });
        });
    });
});

function dummyCallback(result){
    console.log(result);
}
