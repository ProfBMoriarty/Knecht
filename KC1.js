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
