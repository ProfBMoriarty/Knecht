var K = {};
(function ()
{
    "use strict";

    //region Global Variables
    //values rarely changed during a session, stored so they do not need to be provided explicitly to each function call
    var _address = 'http://perlenspiel.cs.wpi.edu/';  //the address of the server, with trailing slash
    var _application = '';  //application name; clients can only act on data using the same app name
    var _error_callback = function(functionName, err){}; //function to be called in case of request failure
    var _username = '';  //the user's username address serving as the name of his account
    var _password = '';  //the user's password, used to validate the account
    var _session = ''; //the authentication token from the most recent login
    //endregion

    //region Utility Functions

    /**
     * Checks whether a given string can be parsed as a JSON object
     * @param string the string to be tested
     * @returns {boolean} true if the string is valid JSON, false otherwise
     * @private
     */
    function _isJSON ( string )
    {
        try
        {
            JSON.parse( string );
        }
        catch ( e )
        {
            return false;
        }
        return true;
    }

    /**
     * This function is used as a callback for server requests.
     * @param result is the result of the query
     * @param fp is a function from this file that accesses the server
     * @param functionName is a string that is the name of fp
     * @param args is an array of up to 5 arguments suitable for the fp function
     * @param callback a function to be called once a response is received from the server
     */
    function _autoRelog(result, fp, functionName, args, callback)
    {
        if  (result.error === 'Expired session' )
        {//if request failed because session has timed out
            K.login(_username, _password, function(login_result)
            {//attempt to log back in using last used username and password
                if (!login_result.error)
                {//if login successful, re-attempt original request
                    fp(args[0], args[1], args[2], args[3], args[4]);
                }
                else
                {//otherwise, return original failure result
                    callback(result);
                }
            });
        }
        else
        {//otherwise, return original request result
            callback(result);
        }
        if ( result.error && _error_callback )
        {
            _error_callback(functionName, result.error);
        }
    }

    //endregion

    /**
     *Submits a request to the previously specified server address and relays the response to a callback function
     * @param method HTTP method string indicating the action to be taken on the resource
     * @param path URI string indicating the resource to be requested
     * @param callback function called when server response is received
     * @param body optional parameter containing data to be sent in the body of the request
     * @private
     */
    function _sendRequest ( method, path, callback, body ) //sends a request to the server and passes result to callback
    {
        var request = new XMLHttpRequest();
        request.onreadystatechange = function ()
        {
            if ( request.readyState === request.DONE )
            {//once response has been received in full
                if( _isJSON(request.responseText) )
                {//Body of a proper Knecht server response will always be a JSON string
                    callback( JSON.parse(request.responseText ) );
                }
                else
                {//if a JSON string is not in the response text, then either the server is down or is not a Knecht server
                    callback( {error: 'No Response Or Response Text Was Not JSON'} );
                }
            }
        };
        request.open( method, _address + path, true );
        request.send( JSON.stringify(body) );
    }

    /**
     * Optionally sets client configuration variables then returns an object containing their current values
     * @param config OPTIONAL object parameter whose members are configuration variables for the Knecht client
     *              address: string indicating address of the server, with a trailing slash
     *              application: string naming the application using Knecht
     *              error_callback: function called if server error occurs
     *              username: username string used in login
     *              password: password string used in login
     *              session: session id string returned by valid login
     * @returns {{address: *, application: *, error_callback: *, username: *, password: *, session: *}}
     */
    K.config = function ( config )
    {
        if( typeof config === 'object' )
        {//only bother to check if config is present and of correct type. set each variable if present and right type
            _address = typeof config.address === 'string' ? encodeURI( config.address ) : _address;
            _application = typeof config.application === 'string' ? encodeURIComponent( config.application ) : _application;
            _error_callback = typeof config.error_callback === 'function' ? config.error_callback : _error_callback;
            _username = typeof config.username === 'string' ? encodeURIComponent( config.username ) : _username;
            _password = typeof config.password === 'string' ? config.password : _password;
            _session = typeof config.session === 'string' ? encodeURIComponent( config.session ) : _session;
        }
        return {
            address: _address,
            application: _application,
            error_callback: _error_callback,
            username: _username,
            password: _password,
            session: _session
        };
    };

    //region User Functions

    //region Account functions

    /**
     * Gets a list of users on this server according to a set of constraints
     * @param constraints object with members defining the constraints returned users must meet. Possible conditions are:
     *              username: a user will only be returned if their username exactly matches this string
     *              group_name: a user will only be returned if they are the host or a member of the group matching this string
     *              online: if this variable is true, a user will only be returned if they have an unexpired session
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: optional, a string specifying the error that occurred processing the request
     *        users: optional, an array of username strings meeting the request constraints
     */
    K.getUsers = function ( constraints, callback )
    {
        _sendRequest( "GET", "users" +
            "?constraints=" + encodeURIComponent( JSON.stringify( constraints ) ),
            function ( res )
            {
                callback( res );
                if( res.error)
                {
                    _error_callback('getUsers', res.error );
                }
            },
            null
        );
    };

    /**
     * Registered a new user account on the server and logs it in on this client
     * @param username the username to be registered
     * @param password the password to be used for the new account
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     * @param timeout OPTIONAL how long a session key remains valid for in minutes. default 15
     */
    K.register = function ( username, password, callback, timeout )
    {
        K.config( { username : username, password: password } );
        _sendRequest( "POST", "users" +
                "?username=" + _username +
                "&timeout=" + encodeURIComponent( timeout ),
            function ( res )
            {
                if ( !res.error )
                {
                    _session = encodeURIComponent( res.session );
                }
                callback( res );
                if( res.error)
                {
                    _error_callback( 'register', res.error );
                }
            },
            _password
        );
    };

    /**
     * Unregisters a user account from the server and removes all of its data
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     * If first call failed due to expired session_id, knecht will attempt to log in with stored details and try again
     */
    K.unregister = function(callback)
    {
        _sendRequest("DELETE", "users" +
            "?username=" + _username +
            "&session=" + _session,
            function(result)
            {
                _autoRelog(result, K.unregister, 'unregister', [callback], callback);
            },
            null
        );
    };

    /**
     * Authenticates account details to server and receives a session token allowing use of functions on that user
     * @param username the account to be logged in
     * @param password the password of the account to be logged in
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.login = function ( username, password, callback )
    {
        K.config( { username : username, password: password } );
        _sendRequest( "PUT", "users/session" +
            "?username=" + _username,
            function (result )
            {
                if (!result.error)
                {
                    _session = encodeURIComponent( result.session );
                }
                callback( result );
                if( result.error )
                {
                    _error_callback('login', result.error );
                }
            },
            _password
        );
    };

    /**
     * Expires a session token and removes that user's stored login information from the client
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.logout = function( callback )
    {
        _sendRequest("DELETE", "users/session" +
            "?username=" + _username +
            "&session=" + _session,
            function( res )
            {
                K.config( {username: '', password: ''} );
                callback( res );
                if( res.error )
                {
                    _error_callback( 'logout', res.error );
                }
            },
            null
        );
    };

    /**
     * Causes an email to be sent to the given email address with the registered password
     * @param username is a string that is the email address used to identify the account in question
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        status: a string specifying whether result of the request was K.OK, K.UNAUTHORIZED, K.INVALID, or K.ERROR
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.recoverPassword = function(username, callback)
    {
        _sendRequest("GET", 'users/password' +
            '?username=' + encodeURIComponent( username ),
            function(result)
            {
                callback(result);
                if ( result.error )
                {
                    _error_callback('recoverPassword', result.error );
                }
            },
            null
        );
    };

    /**
     * Changes the password of the currently logged in account.
     * @param password is a string that is the new password of the account
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.changePassword = function( password, callback )
    {
        _sendRequest("PUT", "users/password" +
            "?username=" + _username +
            "&session=" + _session,
            function ( result )
            {
                if (result.error === 'Expired session')
                {
                    K.login( _username, _password, function ( login_result )
                    {
                        if (!login_result.error)
                        {
                            K.changePassword( password, callback );
                        }
                        else
                        {
                            callback( result );
                        }
                    }
                    );
                }
                else
                {
                    _password = password;
                    callback( result );
                }
                if ( result.error )
                {
                    _error_callback( 'changePassword', result.error );
                }
            },
            password
        );
    };
    //endregion

    //region Data functions

    /**
     * Submits single-user data to be saved on the server for the current user and app
     * @param field either a string naming the field to be updated, or an array of such
     * @param data the data to be stored in the specified fields. If field is an array this must be one of the same length
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.putData = function ( field, data, callback )
    {
        _sendRequest( "PUT", "users/data" +
            "?username=" + _username +
            "&session=" + _session +
            "&application=" + _application +
            "&field=" + encodeURIComponent(JSON.stringify(field)),
            function ( result )
            {
                _autoRelog(result, K.putData, 'putData', [field, data, callback], callback);
            },
            data
        );
    };
    /**
     * Submits single-user data to be retrieved from the server for the current user and app
     * @param field either a string naming the field to be retrieved, or an array of such
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     *        data: if present, an object containing the retrieved data with fields as member names.
     *              A field is undefined if it was not found on the server
     */
    K.getData = function ( field, callback )
    {
        _sendRequest( "GET", "users/data" +
            "?username=" + _username +
            "&session=" + _session +
            "&application=" + _application +
            "&field=" + encodeURIComponent(JSON.stringify(field)),
            function ( result )
            {
                _autoRelog(result, K.getData, 'getData', [field, callback], callback);
            },
        null
        );
    };
    /**
     * Submits single-user data to be deleted from the server
     * @param field either a string naming the field to be deleted, or an array of such
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.deleteData = function ( field, callback )
    {
        _sendRequest( "DELETE","users/data" +
            "?username=" + _username +
            "&session=" + _session +
            "&application=" + _application +
            "&field=" + encodeURIComponent(JSON.stringify(field)),
            function (result )
            {
                _autoRelog( result, K.deleteData, 'deleteData', [field, callback], callback);
            },
        null
        );
    };
    //endregion

    //endregion

    //region Group functions

    //region Group functions

    /**
     * Gets a list of users on this server according to a set of constraints
     * @param constraints object with members defining the constraints returned users must meet. Possible conditions are:
     *              username: a group will only be returned if this user is a member
     *              group_name: a group will only be returned if its name exactly matches this string
     *              application: a group will only be returned if it is using this application
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: optional, a string specifying the error that occurred processing the request
     *        groups: optional, an array of group name strings meeting the request constraints
     */
    K.getGroups = function ( constraints, callback )
    {
        _sendRequest( "GET", "groups" +
            "?constraints=" + encodeURIComponent( JSON.stringify( constraints ) ),
            function ( res )
            {
                callback( res );
                if( res.error)
                {
                    _error_callback('getGroups', res.error );
                }
            },
            null
        );
    };

    /**
     * Initiates a group with the requester as host
     * @param group_name uniquely identifying string serving as the group name
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.startGroup = function ( group_name, callback )
    {
        _sendRequest( "POST", "groups" +
            "?username=" + _username +
            "&session=" + _session +
            "&application=" + _application +
            "&group_name=" + encodeURIComponent( group_name ),
            function (result )
            {
                _autoRelog(result, K.startGroup, 'startGroup', [group_name, callback], callback);
            },
            null
        );
    };

    /**
     * Removes a group and all its related data and information from the server. Notifies all members with pending requests
     * @param group_name the name of the group to be closed
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.closeGroup = function ( group_name, callback )
    {
        _sendRequest( "DELETE","groups" +
            "?username=" + _username +
            "&session=" + _session +
            "&group_name=" + encodeURIComponent( group_name ),
            function ( result )
            {
                _autoRelog(result, K.closeGroup, 'closeGroup', [group_name, callback], callback);
            },
        null
        );
    };

    //endregion

    //region Member functions

    /**
     * Adds a user to the list of members for a group you are the host of
     * @param group_name string identifying the group to be added to
     * @param member string identifying the member to be added
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.addMember = function ( group_name, member, callback )
    {
        _sendRequest( "POST", "groups/members" +
            "?username=" + _username +
            "&session=" + _session +
            "&group_name=" + encodeURIComponent( group_name ) +
            "&member=" + encodeURIComponent( member ),
            function ( result )
            {
                _autoRelog(result, K.addMember, 'addMember', [group_name, member, callback], callback);
            },
        null
        );
    };

    /**
     * Removes a user from the list of members for a group you are the host of
     * @param group_name string identifying the group
     * @param member string identifying the member to be removed
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.removeMember = function ( group_name, member, callback )
    {
        _sendRequest( "DELETE", "groups/members" +
            "?username=" + _username +
            "&session=" + _session +
            "&group_name=" + encodeURIComponent( group_name ) +
            "&member=" + encodeURIComponent( member ),
            function ( result )
            {
                _autoRelog(result, K.removeMember, 'removeMember', [group_name, member, callback], callback);
            },
            null
        );
    };

    //endregion

    //region Data functions

    /**
     * Allows the host of a group to post updated data and notify its members. Optionally, permissions may be set
     * @param group_name string identifying the group to be updated
     * @param field either a string or array of strings identifying the fields to be updated
     * @param data any object or array of objects containing the data to be stored. Of the same length as fields
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     * @param member optional string or list of strings identifying the users whose permissions are being set
     * @param permission optional boolean, array of booleans, or array of arrays of booleans indicating whether members
     *        are allowed to access the corresponding data
     */
    K.submitUpdate = function(group_name, field, data, callback, member, permission)
    {
        var query = "groups/data" + "" +
            "?username=" + _username +
            "&session=" + _session +
            "&group_name=" + encodeURIComponent(group_name) +
            "&field=" + encodeURIComponent(JSON.stringify(field));
        if(member)
        {
            query += "&member=" + encodeURIComponent(JSON.stringify(member));
        }
        if(permission)
        {
            query += "&permission=" + encodeURIComponent(JSON.stringify(permission));
        }
        _sendRequest( "PUT", query,
            function ( result )
            {
                _autoRelog(result, K.submitUpdate, 'submitUpdate',
                    [group_name, field, data, callback, member, permission], callback);
            },
            data
        );
    };

    /**
     * Retrieves one or more shared data fields from the server
     * @param group string identifying the group the data belongs to
     * @param field string or array of strings identifying the data to be retrieved
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     *        data: if present, an object with members corresponding to the requested data
     */
    K.getGroupData = function(group, field, callback)
    {
        _sendRequest( "GET", "groups/data" +
            "?username=" + _username +
            "&session=" + _session +
            "&group_name=" + encodeURIComponent(group) +
            "&field=" + encodeURIComponent(JSON.stringify(field)),
            function (result )
            {
                _autoRelog(result, K.getGroupData, 'getGroupData', [group, field, callback], callback);
            },
        null
        );
    };

    /**
     *
     * @param group_name string identifying the group to be acted on
     * @param field string or array of strings identifying the fields being acted on
     * @param permission boolean, array of booleans, or array of booleans indicating whether the permission is granted or revoked
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     * @param member optionally, a string or array of strings identifying the users the permissions are for
     */
    K.setPermission = function(group_name, field, permission, callback, member)
    {
        var query = "groups/data/permissions" +
            "?username=" + _username +
            "&session=" + _session +
            "&group_name=" + encodeURIComponent(group_name) +
            "&field=" + encodeURIComponent(JSON.stringify(field));
        if(member)
        {
            query += "&members=" + encodeURIComponent(JSON.stringify(member));
        }
        _sendRequest( "PUT", query,
            function (result )
            {
                _autoRelog(result, K.setPermission, 'setPermission', [group_name, field, callback, member], callback);
            },
            null
        );
    };

    /**
     * Subscribes to updates from the server, to be notified when a field changes or a new permission is gained
     * @param group_name the group to subscribe to
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     *        updates: if present, an array of strings identifying fields whose data needs to be re-read
     *        If not defined and status ok, membership in group has been terminated
     *        data: if present, an object containing the new data values for fields of size less than the limit
     * @param limit number indicating maximum size in bytes of data to be retrieved. Only the field name will be sent if data
     *        exceeds limit. No limit is set if this parameter is undefined
     * @param clear an array of update ids acknowledged, server no longer needs to keep them
     */
    K.listenUpdate = function(group_name, callback, limit, clear)
    {
        if(!clear)
        {
            clear = [];
        }
        if(!limit)
        {
            limit = Number.MAX_VALUE;
        }
        _sendRequest( "GET", "groups/updates" +
            "?username=" + _username +
            "&session=" + _session +
            "&group_name=" + encodeURIComponent(group_name) +
            "&limit=" + encodeURIComponent(JSON.stringify(limit)) +
            "&clear=" + encodeURIComponent(JSON.stringify(clear)),
            function ( result )
            {
                if ( result.error === 'Expired Session ID')
                {
                    K.login( _username, _password, function ( login_result )
                    {
                        if ( !login_result.error )
                        {
                            K.listenUpdate( group_name, callback, limit, clear );
                        }
                        else
                        {
                            callback(result);
                        }
                    } );
                }
                else
                {
                    callback(result);
                    if (!result.error && result.updates !== undefined )
                    {
                        K.listenUpdate(group_name, callback, limit, result.clear );
                    }
                }
                if( result.error)
                {
                    _error_callback('listenUpdate', result.error );
                }
            },
            null
        );
    };

    /**
     * Subscribes to input from the server, to be notified when a user submits something to a group
     * @param group_name the group to subscribe to
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     *        inputs: if present, an array of objects identifying the sending user, a timestamp, and their input
     *        If not defined and status ok, membership in group has been terminated
     *        data: if present, an object containing the new data values for fields of size less than the limit
     * @param clear an array of input ids acknowledged, server no longer needs to keep them
     */
    K.listenInput = function(group_name, callback, clear)
    {
        if(!clear)
        {
            clear = [];
        }
        _sendRequest( "GET", "groups/input" +
            "?username=" + _username +
            "&session=" + _session +
            "&group_name=" + encodeURIComponent(group_name) +
            "&clear=" + encodeURIComponent(JSON.stringify(clear)),
            function ( result )
            {
                if ( result.error === 'Expired Session ID')
                {
                    K.login( _username, _password, function ( login_result )
                    {
                        if ( !login_result.error )
                        {
                            K.listenInput( group_name, callback, clear );
                        }
                        else
                        {
                            callback(result);
                        }
                    } );
                }
                else
                {
                    callback(result);
                    if (!result.error && result.inputs !== undefined )
                    {
                        K.listenInput(group_name, callback, result.clear );
                    }
                }
                if( result.error)
                {
                    _error_callback('listenInput', result.error );
                }
            },
            null
        );
    };

    /**
     * Submits input to a group for processing by host client
     * @param group_name string identifying the group
     * @param input object containing arbitrary input data
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.submitInput = function(group_name, input, callback)
    {
        _sendRequest( "POST", "groups/input" +
            "?username=" + _username +
            "&session=" + _session +
            "&group_name=" + encodeURIComponent(group_name),
            function ( result )
            {
                _autoRelog(result, K.submitInput, 'submitInput', [group_name, input, callback], callback);
            },
            input
        );
    };
    //endregion

    //endregion

} () );
