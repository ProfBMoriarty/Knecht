/*jslint nomen: true, white: true, vars: true */
/*global document, window, screen, console, XMLHttpRequest */

var K = {};
(function ()
{
    "use strict";

    //region Globals
    //values rarely changed during a session, stored so they do not need to be provided explicitly to each function call
    var _address = null;  //the address of the server
    var _app = null;  //application name; clients can only act on data using the same app name
    var _username = null;  //the user's username address serving as the name of his account
    var _password = null;  //the user's password, used to validate the account
    var _session_id = null; //the authentication token from the most recent login
    var _error_callback = null; //function to be called in case of request failure
    //endregion

    //region Response Result Constants
    K.responses = { //mapping between http response codes and Knecht result strings
        200 : "K.OK", //the request was fulfilled successfully
        401 : "K.UNAUTHORIZED", //the request could not be fulfilled because the authentication parameters are invalid
        403 : "K.INVALID", //the request could not be fulfilled because an invalid resource/argument has been specified
        500 : "K.ERROR" //the request could not be fulfilled because a database error has occurred
    };
    K.OK = K.responses[200];
    K.UNAUTHORIZED = K.responses[401];
    K.INVALID = K.responses[403];
    K.ERROR = K.responses[500];
    //endregion

    //region Helper Functions

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

    function _sendRequest ( method, path, callback, body ) //sends a request to the server and passes result to callback
    {
        var request = new XMLHttpRequest();
        request.onreadystatechange = function ()
        {
            if ( request.readyState === request.DONE )
            {
                if( _isJSON(request.responseText))
                {
                    callback( request.status, JSON.parse(request.responseText ));
                }
                else
                {
                    callback(500,{error: 'Response Text Was Not JSON'});
                }
            }
        };
        request.open( method, _address + path, true );
        request.send( JSON.stringify(body) );
    }

    /**
     * This function is used as a callback for server requests.
     * @param status is an integer that is the status of the request to the server
     * @param result is the result of the query
     * @param fp is a function from this file that accesses the server
     * @param fn is a string that is the name of fp
     * @param args is an array of 5 arguments suitable for the fp function
     * @param callback a function to be called once a response is received from the server
     */
    function _autoRelog(status, result, fp, fn, args, callback)
    {
        if  (K.responses[status] === K.UNAUTHORIZED )
        {
            K.login(_username, _password, function(login_result)
            {
                if ( login_result.status === K.OK )
                {
                    fp(args[0], args[1], args[2], args[3], args[4]);
                }
                else
                {
                    result.status = K.UNAUTHORIZED;
                    callback(result);
                }
            });
        }
        else
        {
            result.status = K.responses[status];
            callback(result);
        }
        if ( result.error && _error_callback )
        {
            _error_callback(fn, result.error);
        }
    }
    //endregion

    //region Config Functions
    //specifies the address of the Knecht server. Must be called before any other Knecht functions will work
    //the address variable is the URL or ip address of the server that requests are to be sent to
    K.setAddress = function ( address )
    {
        _address = encodeURI( address );  //user input must be sanitized before it can be included in the URI
    };
    //specifies the name of the application using Knecht
    //Must be called before any single-user data functions or the startGroup function are called
    //the app variable is the name of the application
    K.setApplication = function ( app )
    {
        _app = encodeURIComponent( app );  //user input must be sanitized before it can be included in the URI
    };
    /**
     * Sets a function to be called whenever a server request comes back as a failure
     * @param callback the function to be called. must take two strings as parameter: the function name, and the error
     */
    K.setErrorCallback = function ( callback )
    {
        if ( typeof callback === 'function' )
        {
            _error_callback = callback;
        }
    };
    //endregion

    //region User API functions
    /**
     * Determines whether a given username is registered on the server
     * @param username the username to be checked
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     *        registered: if present, a boolean set to true if the user is registered, otherwise false
     */
    K.checkUserRegistered = function ( username, callback )
    {
        _sendRequest( "GET",
            "/users?username=" + encodeURIComponent( username ),
            function ( status, result )
            {
                result.status = K.responses[status];
                callback( result );
                if ( result.error && _error_callback )
                {
                    _error_callback( 'checkUserRegistered', result.error );
                }
            } );
    };
    /**
     * Registered a new user account on the server and logs it in on this client
     * @param username the username to be registered
     * @param password the password to be used for the new account
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     * @param timeout OPTIONAL how long a session key remains valid for in minutes. default 15
     */
    K.register = function ( username, password, callback, timeout )
    {
        _username = encodeURIComponent( username );
        _password = password;
        if ( !timeout )
        {
            timeout = 15;
        }
        _sendRequest( "POST",
            "/users?username=" + _username +
                "&timeout=" + encodeURIComponent( timeout ),
            function ( status, result )
            {
                if ( K.responses[status] === K.OK )
                {
                    _session_id = encodeURIComponent( result.session );
                }
                result.status = K.responses[status];
                callback(result);
                if( result.error && _error_callback )
                {
                    _error_callback('register', result.error );
                }
            }, _password );
    };
    /**
     * Unregisters a user account from the server and removes all of its data
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     * If first call failed due to expired session_id, knecht will attempt to log in with stored details and try again
     */
    K.unregister = function(callback)
    {
        _sendRequest("DELETE",
            "/users?session_id=" + _session_id,
            function(status, result)
            {
                _autoRelog(status, result, K.unregister, 'unregister', [callback], callback);
            });
    };

    //endregion

    //region User Session API functions
    /**
     * Authenticates account details to server and receives a session token allowing use of functions on that user
     * @param username the account to be logged in
     * @param password the password of the account to be logged in
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.login = function ( username, password, callback )
    {
        _username = encodeURIComponent( username );
        _password = password;
        _sendRequest( "PUT",
            "/users/session?username=" + _username,
            function ( status, result )
            {
                if ( K.responses[status] === K.OK )
                {
                    _session_id = encodeURIComponent( result.session );
                }
                result.status = K.responses[status];
                callback(result);
                if( result.error && _error_callback)
                {
                    _error_callback('login', result.error );
                }
            }, _password );
    };
    /**
     * Expires a session token and removes that user's stored login information from the client
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.logout = function(callback)
    {
        _username = null;
        _password = null;
        _sendRequest("DELETE", "users/session?session_id=" + _session_id,
            function(status, result)
            {
                result.status = K.responses[status];
                callback(result);
                if( result.error && _error_callback)
                {
                    _error_callback('logout', result.error );
                }
            });
    };
    //endregion

    //region User Password API functions

    /**
     * Causes an email to be sent to the given email address with the registered password
     * @parm username is a string that is the email address used to identify the account in question
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.recoverPassword = function(username, callback)
    {
        _sendRequest("GET",
            'users/password?username=' + encodeURIComponent(username),
            function(status, result)
            {
                result.status = K.responses[status];
                callback(result);
                if ( result.error && _error_callback )
                {
                    _error_callback('recoverPassword', result.error );
                }
            });
    };

    /**
     * Changes the password of the currently logged in account.
     * @parm new_password is a string that is the new password of the account
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.changePassword = function(new_password, callback)
    {
        _sendRequest("PUT",
            'users/password?session_id=' + _session_id,
            function ( status, result )
            {
                if ( K.responses[status] === K.UNAUTHORIZED )
                {
                    K.login( _username, _password, function ( login_result )
                    {
                        if ( login_result.status === K.OK )
                        {
                            K.changePassword(new_password, callback );
                        }
                        else
                        {
                            result.status = K.UNAUTHORIZED;
                            callback(result);
                        }
                    } );
                }
                else
                {
                    _password = new_password;
                    result.status = K.responses[status];
                    callback(result);
                }
                if ( result.error && _error_callback)
                {
                    _error_callback('changePassword', result.error );
                }
            }, new_password );
    };
    //endregion

    //region User Data API functions
    /**
     * Submits single-user data to be saved on the server for the current user and app
     * @param field either a string naming the field to be updated, or an array of such
     * @param data the data to be stored in the specified fields. If field is an array this must be one of the same length
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.putData = function ( field, data, callback )
    {
        _sendRequest( "PUT",
            "/users/data?session_id=" + _session_id +
                "&app=" + _app +
                "&field=" + encodeURIComponent(JSON.stringify(field)),
            function ( status, result )
            {
                _autoRelog(status, result, K.putData, 'putData', [field, data, callback], callback);
            }, data );
    };
    /**
     * Submits single-user data to be retrieved from the server for the current user and app
     * @param field either a string naming the field to be retrieved, or an array of such
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     *        data: if present, an object containing the retrieved data with fields as member names.
     *              A field is undefined if it was not found on the server
     */
    K.getData = function ( field, callback )
    {
        _sendRequest( "GET",
            "/users/data?session_id=" + _session_id +
                "&app=" + _app +
                "&field=" + encodeURIComponent(JSON.stringify(field)),
            function ( status, result )
            {
                _autoRelog(status, result, K.getData, 'getData', [field, callback], callback);
            } );
    };
    /**
     * Submits single-user data to be deletedd from the server
     * @param field either a string naming the field to be deleted, or an array of such
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.deleteData = function ( field, callback )
    {
        _sendRequest( "DELETE",
            "/users/data?session_id=" + _session_id +
                "&app=" + _app +
                "&field=" + encodeURIComponent(JSON.stringify(field)),
            function ( status, result )
            {
                _autoRelog(status, result, K.deleteData, 'deleteData', [field, callback], callback);
            } );
    };
    //endregion

    //region Groups API functions
    /**
     * Initiates a group with the requester as host
     * @param group uniquely identifying string serving as the group name
     * @param grouppass password string for use with locked groups
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.startGroup = function ( group, grouppass, callback )
    {
        _sendRequest( "POST",
            "/groups?session_id=" + _session_id +
                "&app=" + _app + "&group=" + encodeURIComponent( group ),
            function ( status, result )
            {
                _autoRelog(status, result, K.startGroup, 'startGroup', [group, grouppass, callback], callback);
            }, grouppass );
    };
    /**
     * Provides a list of active groups using the same application as the client
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     *        groups: if present, an array containing the names of all groups registered with the currently set application
     */
    K.listGroupsOfApp = function(callback)
    {
        _sendRequest( "GET",
            "/groups?app=" + _app,
            function (status, result)
            {
                result.status = K.responses[status];
                callback(result);
                if ( result.error && _error_callback )
                {
                    _error_callback('listGroupsOfApp', result.error );
                }
            });
    };

    /**
     * Removes a group and all its related data and information from the server. Notifies all members with pending requests
     * @param group the name of the group to be closed
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.closeGroup = function ( group, callback )
    {
        _sendRequest( "DELETE",
            "/groups?session_id=" + _session_id +
                "&group=" + encodeURIComponent( group ),
            function ( status, result )
            {
                _autoRelog(status, result, K.closeGroup, 'closeGroup', [group, callback], callback);
            } );
    };
    //endregion

    //region Group Password API functions
    /**
     * Checks whether a given string is the password to the group
     * @param group string identifying the group to be accessed
     * @param password the string to check against the registered group password
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     *        correct: if present, boolean true if password matches, otherwise wise
     */
    K.checkGroupPassword = function (group, password, callback)
    {
        _sendRequest( "POST",
            "/groups/password?group=" + encodeURIComponent(group),
            function(status, result)
            {
                result.status = K.responses[status];
                callback( result );
                if( result.error && _error_callback)
                {
                    _error_callback('checkGroupPassword', result.error );
                }
            }, password);
    };
    //endregion

    //region Group Members API functions
    /**
     * Adds a user to the list of members for a group you are the host of
     * @param group string identifying the group to be added to
     * @param username string identifying the member to be added
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.addMember = function ( group, username, callback )
    {
        _sendRequest( "POST",
            "/groups/members?session_id=" + _session_id +
                "&group=" + encodeURIComponent( group ) +
                "&username=" + encodeURIComponent(username),
            function ( status, result )
            {
                _autoRelog(status, result, K.addMember, 'addMember', [group, username, callback], callback);
            } );
    };
    /**
     * Lists all members of a named group in an array
     * @param group string identifying the group
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     *        host: if present, a string identifying the host of the group
     *        members: if present, an array of strings identifying the non-host group members
     */
    K.listMembersOfGroup = function ( group, callback )
    {
        _sendRequest( "GET", "/groups/members?group=" + encodeURIComponent( group ),
            function ( status, result )
            {
                result.status = K.responses[status];
                callback(result);
                if( result.error && _error_callback)
                {
                    _error_callback('listMembersOfGroup', result.error );
                }
            } );
    };
    /**
     * Removes a user from the member list of a group you are host of
     * @param group string identifying the group
     * @param username string identifying the user to be removed
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.removeMember = function ( group, username, callback )
    {
        _sendRequest( "DELETE",
            "/groups/members?session_id=" + _session_id +
                "&group=" + encodeURIComponent( group ) +
                "&username=" + encodeURIComponent(username),
            function ( status, result )
            {
                _autoRelog(status, result, K.removeMember, 'removeMember', [group, username, callback], callback);
            } );
    };
    //endregion

    //region Group Data API functions
    /**
     * Allows the host of a group to post updated data and notify its members. Optionally, permissions may be set
     * @param group string identifying the group to be updated
     * @param fields either a string or array of strings identifying the fields to be updated
     * @param data any object or array of objects containing the data to be stored. Of the same length as fields
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     * @param permissions optional boolean, array of booleans, or array of arrays of booleans indicating whether members
     *        are allowed to access the corresponding data
     * @param members optional string or list of strings identifying the users whose permissions are being set
     */
    K.submitUpdates = function(group, fields, data, callback, permissions, members)
    {
        var query_string = "/groups/data?session_id=" + _session_id +
            "&group=" + encodeURIComponent(group) +
            "&fields=" + encodeURIComponent(JSON.stringify(fields));
        if (permissions)
        {
            query_string += "&permissions=" + encodeURIComponent(JSON.stringify(permissions));
        }
        if (members)
        {
            query_string += "&members=" + encodeURIComponent(JSON.stringify(members));
        }
        _sendRequest("PUT",
            query_string,
            function ( status, result )
            {
                _autoRelog(status, result, K.submitUpdates, 'submitUpdates',
                    [group, fields, data, callback, permissions, members], callback);
            }, data);
    };
    /**
     * Retrieves one or more shared data fields from the server
     * @param group string identifying the group the data belongs to
     * @param fields string or array of strings identifying the data to be retrieved
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     *        data: if present, an object with members corresponding to the requested data
     */
    K.getGroupData = function(group, fields, callback)
    {
        _sendRequest( "GET",
            "/groups/data?session_id=" + _session_id +
                "&group=" + encodeURIComponent(group) +
                "&field=" + encodeURIComponent(JSON.stringify(fields)),
            function ( status, result )
            {
                _autoRelog(status, result, K.getGroupData, 'getGroupData', [group, fields, callback], callback);
            } );
    };
    //endregion

    //region Group Permissions API functions
    /**
     *
     * @param group string identifying the group to be acted on
     * @param fields string or array of strings identifying the fields being acted on
     * @param permissions boolean, array of booleans, or array of booleans indicating whether the corresponding fields can be read by corresponding members
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     * @param members optionally, a string or array of strings identifying the users the permissions are for
     */
    K.setPermissions = function(group, fields, permissions, callback, members)
    {
        var query_string = "/groups/data/permissions?session_id=" + _session_id +
            "&group=" + encodeURIComponent(group) +
            "&fields=" + encodeURIComponent(JSON.stringify(fields)) +
            "&permissions=" + encodeURIComponent(JSON.stringify(permissions));
        if (members)
        {
            query_string += "&members=" + encodeURIComponent(JSON.stringify(members));
        }
        _sendRequest( "PUT",
            query_string,
            function ( status, result )
            {
                _autoRelog(status, result, K.setPermissions, 'setPermissions', [group, fields, callback, members], callback);
            } );
    };
    //endregion

    //region Groups Updates API functions
    /**
     * Subscribes to updates from the server, to be notified when a field changes or a new permission is gained
     * @param group the group to subscribe to
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     *        updates: if present, an array of strings identifying fields whose data needs to be re-read
     *        If not defined and status ok, membership in group has been terminated
     * @param timestamp number indicating when the last update was sent. used for garbage cleaning old notifications from server
     */
    K.listenUpdates = function(group, callback, timestamp)
    {
        if(!timestamp)
        {
            timestamp = 0;
        }
        _sendRequest( "GET",
            "/groups/updates?session_id=" + _session_id +
                "&group=" + encodeURIComponent(group) +
                "&timestamp=" + encodeURIComponent(JSON.stringify(timestamp)),
            function ( status, result )
            {
                if ( K.responses[status] === K.UNAUTHORIZED )
                {
                    K.login( _username, _password, function ( login_result )
                    {
                        if ( login_result.status === K.OK )
                        {
                            K.listenUpdates( group, callback, timestamp );
                        }
                        else
                        {
                            result.status = K.UNAUTHORIZED;
                            callback(result);
                        }
                    } );
                }
                else
                {
                    result.status = K.responses[status];
                    callback(result);
                    if (result.status === K.OK && result.updates !== undefined )
                    {
                        K.listenUpdates(group, callback, result.timestamp );
                    }
                }
                if( result.error && _error_callback)
                {
                    _error_callback('listenUpdates', result.error );
                }
            } );
    };
    //endregion

    //region Group Inputs API functions
    /**
     * Subscribes to inputs from the server for a group you host, recieving all inputs from users to that group
     * @param group the group to subscribe to
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     *        inputs: if present, an array of objects containing two fields, one identifying the user who submitted it an one with the input itself
     * @param timestamp number indicating when the last input was sent from server. used for garbage cleaning old notifications from server
     */
    K.listenInputs = function(group, callback, timestamp)
    {
        if(!timestamp)
        {
            timestamp = 0;
        }
        _sendRequest( "GET",
            "/groups/input?session_id=" + _session_id +
                "&group=" + encodeURIComponent(group) +
                "&timestamp=" + encodeURIComponent(JSON.stringify(timestamp)),
            function ( status, result )
            {
                if ( K.responses[status] === K.UNAUTHORIZED )
                {
                    K.login( _username, _password, function ( login_result )
                    {
                        if ( login_result.status === K.OK )
                        {
                            K.listenInputs( group, callback, timestamp );
                        }
                        else
                        {
                            result.status = K.UNAUTHORIZED;
                            callback(result);
                        }
                    } );
                }
                else
                {
                    result.status = K.responses[status];
                    callback(result);
                    if(result.status === K.OK && result.inputs !== undefined)
                    {
                        K.listenInputs(group, callback, result.timestamp );
                    }
                }
                if( result.error && _error_callback)
                {
                    _error_callback('listenInputs', result.error );
                }
            } );
    };
    /**
     * Submits input to a group for processing by host client
     * @param group string identifying the group
     * @param input object containing arbitrary input data
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.submitInput = function(group, input, callback)
    {
        _sendRequest( "POST",
            "/groups/input?session_id=" + _session_id +
                "&group=" + encodeURIComponent(group),
            function ( status, result )
            {
                _autoRelog(status, result, K.submitInput, 'submitInput', [group, input, callback], callback);
            }, input );
    };
    //endregion
} () );
