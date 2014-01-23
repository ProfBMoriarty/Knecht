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
    K.responses = {
        200: "K.OK",
        401: "K.UNAUTH",
        403: "K.INVALID",
        500: "K.ERROR"
    };
    K.OK = K.responses[200];
    K.UNAUTH = K.responses[401];
    K.INVALID = K.responses[403];
    K.ERROR = K.responses[500];
    //endregion

    //region Config Functions
    K.setAddress = function(address){
        _address = encodeURI(address);
    };

    K.setApplication = function(app){
        _app = encodeURIComponent(app);
    };
    //endregion

    //region Users functions
    K.checkUser = function(email, callback){
        _sendRequest("HEAD", "/users?email=" + encodeURIComponent(email), function(status){
            if(K.responses[status] === K.OK) callback(true);
            else if(K.responses[status] === K.INVALID) callback(false);
            else callback(K.ERROR);
        });
    };

    K.register = function(email, password, callback){
        _email = email;
        _password = password;
        _sendRequest("POST", "/users", function(status){
            callback(K.responses[status]);
        });
    };

    K.login = function(email, password, callback){
        _email = email;
        _password = password;
        _sendRequest("GET", "/users", function(status){
            callback(K.responses[status]);
        });
    };

    K.recoverPassword = function(email, callback){
        _sendRequest("GET", "/users/password?email=" + encodeURIComponent(email), function(status){
            callback(K.responses[status]);
        });
    };

    K.changePassword = function(password, callback){
        _sendRequest("PUT", "/users/password", function(status){
            if(K.responses[status] === K.OK) _password = password;
            callback(K.responses[status]);
        }, password);
    };

    K.unregister = function(callback){
        _sendRequest("DELETE", "/users", function(status){
            callback(K.responses[status]);
        });
    };
    //endregion

    //region User Data functions

    K.putData = function(field, data, callback){
        _sendRequest("PUT", "/users/data?app=" + _app + "&field=" + encodeURIComponent(field), function(status, result){
            callback(K.responses[status]);
        }, data);
    };

    K.getData = function(field, callback){
        _sendRequest("GET", "/users/data?app=" + _app + "&field=" + encodeURIComponent(field), function(status, result){
            if(K.responses[status] === K.OK) callback(result);
            else callback(K.responses[status]);
        });
    };

    K.deleteData = function(field, callback){
        _sendRequest("DELETE", "/users/data?app=" + _app + "&field=" + encodeURIComponent(field), function(status){
            callback(K.responses[status]);
        });
    };
    //endregion

    //region Groups functions

    //region Host functions
    K.startGroup = function(group, grouppass, callback){
        _sendRequest("POST", "/groups?app=" + _app + "&group=" + encodeURIComponent(group), function(status){
            callback(K.responses[status]);
        }, grouppass);
    };

    K.listGroups = function(callback){
        _sendRequest("GET", "/groups?app=" + _app, function(status, result){
            if(K.responses[status] = K.OK) callback(result);
            else callback(K.responses[status]);
        });
    };

    K.closeGroup = function(group, callback) {
        _sendRequest("DELETE", "/groups?group=" + group, function(status){
            callback(K.responses[status]);
        });
    };

    K.addMember = function(group, email, callback) {
        _sendRequest("POST", "/groups/members?group=" + encodeURIComponent(group) + "&email=" + encodeURIComponent(email),
            function(status){
                callback(K.responses[status]);
            });
    };

    K.listMembers = function(group, callback){
        _sendRequest("GET", "/groups/members?group=" + encodeURIComponent(group), function(status, result){
            if(K.responses[status] = K.OK) callback(result);
            else callback(K.responses[status]);
        });
    };

    K.removeMember = function(group, email, callback) {
        _sendRequest("DELETE", "/groups/members?group=" + encodeURIComponent(group) + "&user=" + encodeURIComponent(email),
            function(status){
                callback(K.responses[status]);
            });
    };

    K.submitUpdate = function(group, field, data, callback){
        _sendRequest("PUT", "/groups/data?group=" + encodeURIComponent(group) + "&field=" + encodeURIComponent(field), function(status){
            callback(K.responses[status]);
        }, data);
    }

    K.getGroupData = function(group, field, callback){
        _sendRequest("GET", "/groups/data?group=" + encodeURIComponent(group) + "&field=" + encodeURIComponent(field), function(status, result){
            if(K.responses[status] === K.OK) callback(result);
            else callback(K.responses[status]);
        });
    }

    K.grantPermission = function(group, user, field, callback){
        _sendRequest("PUT", "/groups/data/permissions?group=" +
            encodeURIComponent(group) + "&email=" + encodeURIComponent(user) + "&field=" + encodeURIComponent(field), function(status){
           callback(K.responses[status]);
        });
    }

    K.revokePermission = function(group, user, field, callback){
        _sendRequest("DELETE", "/groups/data/permissions?group=" +
            encodeURIComponent(group) + "&email=" + encodeURIComponent(user) + "&field=" + encodeURIComponent(field), function(status){
            callback(K.responses[status]);
        });
    }

    K.submitInput = function(group, data, callback){
        _sendRequest("POST", "/groups/input?group=" + encodeURIComponent(group), function(status){
            callback(K.responses[status]);
        }, data);
    }

    K.listenInputs = function(group, callback){
        _sendRequest("GET", "/groups/input?group=" + encodeURIComponent(group) +
            "&time=" + new Date().getTime(), function(status, data){
            if(data) callback(data);
            else callback(K.responses[status]);
            if(K.responses[status] === K.OK) K.listenInputs(group, callback);
        });
    }

    K.listenUpdates = function(group, callback){
        _sendRequest("GET", "/groups/updates?group=" + encodeURIComponent(group) +
            "&email=" +encodeURIComponent(_email) +
            "&time=" + new Date().getTime(), function(status, data){
            if(data) callback(data);
            else callback(K.responses[status]);
            if(K.responses[status] === K.OK) K.listenInputs(group, callback);
        });
    }
    //endregion

    //endregion

    function _sendRequest(method, path, callback, body){
        var request = new XMLHttpRequest();
        request.onreadystatechange = function(){
            if(request.readyState === request.DONE) {
                if(request.responseText === '') callback(request.status);
                else callback(request.status, JSON.parse(request.responseText));
                console.log(request.responseText);
            }
        };
        request.open(method, _address + path, true, _email, _password);
        request.withCredentials = true;
        request.send(JSON.stringify(body));
    }
})();
