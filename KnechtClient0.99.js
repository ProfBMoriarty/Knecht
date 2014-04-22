//TODO: cleanup beyond this point

var K = {};
(function ()
{
    "use strict";

    var _internal =
    {
        server: 'http://localhost:8080/', //http address of server, with port number and trailing slash
        application : '', //name of application using Knecht

        username : '', //name of currently logged in user
        password : '', //password of currently logged in user
        session : '', //id of current login session

        group_name : '', //name of currently connected group

        error : null //function callback for handling error responses; takes 2 strings as arguments ( function name, error )
    };

    /**
     * Checks whether a given string is valid JSON or not
     * @param string the string to be tested
     * @returns {boolean}
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
     * Sends a request to the server and passes its response to an internal callback function
     * @param method the http method requested
     * @param path the resource requested
     * @param body (optional) content to be sent too large or sensitive to be included in the path
     * @param callback function taking result object as sole parameter
     * @private
     */
    function _sendRequest( method, path, body, callback )
    {
        if ( callback === undefined )
        {//if no body argument passed, arrange arguments properly
            callback = body;
            body = undefined;
        }
        var request = new XMLHttpRequest();
        request.onreadystatechange = function()
        {
            if( request.readyState === request.DONE )
            {//once response has been received in full
                if( _isJSON( request.responseText ) )
                {//Body of a proper Knecht server response will always be a JSON string
                    callback( JSON.parse( request.responseText ) );
                }
                else
                {//if a JSON string is not in the response text, then either the server is down or not a Knecht server
                    callback( { error: 'Connection Error' } );
                }
            }
        };
        request.open( method, encodeURI(_internal.server) + path, true );
        request.send( JSON.stringify( body ) );
    }

    /**
     * Attempts to re login if a function receives an Expired Session error response
     * @param result the original result of the function
     * @param function_pointer a pointer to the function
     * @param function_name the name of the function
     * @param args the original arguments to the function
     * @private
     */
    function _autoRelog(result, function_pointer, function_name, args )
    {
        if  ( result.error === 'Expired Session' )
        {//if request failed because session has timed out
            K.login(_internal.username, _internal.password, function(login_result)
            {//attempt to log back in using last used username and password
                if ( !login_result.error )
                {//if login successful, re-attempt original request
                    function_pointer( args[0], args[1], args[2], args[3], args[4] );
                }
                else
                {//otherwise, return original failure result
                    args[args.length - 1]( result );
                }
            });
        }
        else
        {//otherwise, return original request result

            if(function_pointer === K.submitUpdate)
            {
                args[args.length - 3](result);
            }
            else if(function_pointer === K.setPermission)
            {
                args[args.length - 2](result);
            }
            else
            {
                args[args.length - 1](result);
            }
        }
        if ( result.error )
        {
            _internal.error(function_name, result.error );
        }
    }

    /**
     * Sets Knecht client's internal variables and returns their current values
     * @param options : object containing new values for internal variables of the same name. Valid members are:
     *      server : http address of Knecht server, with port number and trailing slash
     *      application : name of application using Knecht
     *      username : name of currently logged in user
     *      password : password of currently logged in user
     *      session : id of current login session
     *      group_name: name of currently connected group
     *      error: function callback for handling error responses; takes 2 strings as arguments ( function name, error )
     * @returns {{server: string, application: string, username: string, password: string, session: string, error: null}}
     */
    K.configure = function( options )
    {
        if( typeof options === 'object' )
        {
            if( typeof options.server === 'string' )
            {
                _internal.server = options.server;
            }
            if( typeof options.application === 'string' )
            {
                _internal.application = options.application;
            }
            if( typeof options.username === 'string' )
            {
                _internal.username = options.username;
            }
            if( typeof options.password === 'string' )
            {
                _internal.password = options.password;
            }
            if( typeof options.session === 'string' )
            {
                _internal.session = options.session;
            }
            if( typeof options.group_name === 'string' )
            {
                _internal.group_name = options.group_name;
            }
            if( typeof options.error === 'function' )
            {
                _internal.error = options.error;
            }
        }
        return _internal;
    };

    /**
     * Retrieves a list of Knecht accounts that fit a set of constraints
     * @param constraints the constraints that determine which accounts are include in the list. Valid members are:
     *      username : string the account's username must exactly match
     *      group_name : name of group the account must be a member of
     *      online : if true, the account must have a currently valid session
     * @param callback function that takes the response JSON object as its sole parameter. Valid members are:
     *      timestamp: the time at which the server sent the response, in UNIX time
     *      error: optional, a string specifying the error that occurred processing the request
     *      users: optional, an array of username strings meeting the request constraints
     */
    K.getUsers = function ( constraints, callback )
    {
        if( callback === undefined )
        {//if no constraints argument passed, arrange arguments properly
            callback = constraints;
            constraints = {};
        }
        if( typeof constraints.group_name === 'string' )
        {
            constraints.application = _internal.application;
        }
        _sendRequest( "GET", "users" +
            "?constraints=" + encodeURIComponent( JSON.stringify( constraints ) ),
            function ( result )
            {
                callback( result );
                if( result.error )
                {
                    _internal.error('K.getUsers()', result.error );
                }
            }
        );
    };

    /**
     * Registers a new user account if it does not already exist
     * @param username name to give the account
     * @param password password used to log into account
     * @param timeout how many minutes the resulting login session will remain valid without activity
     * @param callback function that takes the response JSON object as its sole parameter. Valid members are:
     *      timestamp: the time at which the server sent the response, in UNIX time
     *      error: optional, a string specifying the error that occurred processing the request
     *      session: optional, key for the current login session. Only present if no error occurred.
     */
    K.register = function ( username, password, timeout, callback )
    {
        if( callback === undefined )
        {//if no timeout argument passed, arrange arguments properly
            callback = timeout;
            timeout = undefined;
        }
        K.configure( { username : username, password: password } );
        _sendRequest( "POST", "users" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&timeout=" + encodeURIComponent( timeout ),
            _internal.password,
            function ( result )
            {
                if ( !result.error )
                {
                    _internal.session = result.session;
                }
                callback( result );
                if( result.error)
                {
                    _internal.error( 'K.register()', result.error );
                }
            }
        );
    };

    /**
     * Generates a new login session for an existing user account
     * @param username name of account to log into
     * @param password password used to log into account
     * @param timeout how many minutes the resulting login session will remain valid without activity
     * @param callback function that takes the response JSON object as its sole parameter. Valid members are:
     *      timestamp: the time at which the server sent the response, in UNIX time
     *      error: optional, a string specifying the error that occurred processing the request
     *      session: optional, key for the current login session. Only present if no error occurred.
     */
    K.login = function ( username, password, timeout, callback )
    {
        if( callback === undefined )
        {//if no timeout argument passed, arrange arguments properly
            callback = timeout;
            timeout = undefined;
        }
        K.configure( { username : username, password: password } );
        _sendRequest( "PUT", "users/session" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&timeout=" + encodeURIComponent( timeout ),
            _internal.password,
            function ( result )
            {
                if ( !result.error )
                {
                    _internal.session = result.session;
                }
                callback( result );
                if( result.error )
                {
                    _internal.error( 'K.login()', result.error );
                }
            }
        );
    };

    /**
     * Deletes the logged in user account and any associated data from the server
     * @param callback function that takes the response JSON object as its sole parameter. Valid members are:
     *      timestamp: the time at which the server sent the response, in UNIX time
     *      error: optional, a string specifying the error that occurred processing the request
     */
    K.unregister = function( callback )
    {
        _sendRequest( "DELETE", "users" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&session=" + encodeURIComponent( _internal.session ),
            function( result )
            {
                K.configure( { username: '', password: '', session: '' } );
                _autoRelog( result, K.unregister, 'K.unregister()', [ callback ] );
            }
        );
    };

    /**
     * Invalidates the currently active login session
     * @param callback function that takes the response JSON object as its sole parameter. Valid members are:
     *      timestamp: the time at which the server sent the response, in UNIX time
     *      error: optional, a string specifying the error that occurred processing the request
     */
    K.logout = function( callback )
    {
        _sendRequest( "DELETE", "users/session" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&session=" + encodeURIComponent( _internal.session ),
            function( result )
            {
                K.configure( { username: '', password: '', session: '' } );
                callback( result );
                if( result.error )
                {
                    _internal.error( 'K.logout()', result.error );
                }
            }
        );
    };

    /**
     * Changes the password of the currently logged in account
     * @param password the new password for this account
     * @param callback function that takes the response JSON object as its sole parameter. Valid members are:
     *      timestamp: the time at which the server sent the response, in UNIX time
     *      error: optional, a string specifying the error that occurred processing the request
     */
    K.changePassword = function( password, callback )
    {
        _sendRequest("PUT", "users/password" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&session=" + encodeURIComponent( _internal.session ),
            password,
            function ( result )
            {
                if (result.error === 'Expired Session' )
                {
                    K.login( _internal.username, _internal.password, function ( login_result )
                        {
                            if ( !login_result.error )
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
                    if( !result.error )
                    {
                        _internal.password = password;
                    }
                    callback( result );
                }
                if ( result.error )
                {
                    _internal.error( 'K.changePassword()', result.error );
                }
            }
        );
    };

    /**
     * Stores user personal data on the Knecht server
     * @param field names of the data fields to be changed
     * @param data data to be stored
     * @param callback function that takes the response JSON object as its sole parameter. Valid members are:
     *      timestamp: the time at which the server sent the response, in UNIX time
     *      error: optional, a string specifying the error that occurred processing the request
     */
    K.putData = function ( field, data, callback )
    {
        _sendRequest( "PUT", "users/data" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&session=" + encodeURIComponent( _internal.session ) +
            "&application=" + encodeURIComponent( _internal.application ) +
            "&field=" + encodeURIComponent( JSON.stringify( field ) ),
            data,
            function ( result )
            {
                _autoRelog( result, K.putData, 'K.putData()', [ field, data, callback ] );
            }
        );
    };

    /**
     * Retrieves user personal data from the Knecht server
     * @param field the fields whose values are requested
     * @param callback function that takes the response JSON object as its sole parameter. Valid members are:
     *      timestamp: the time at which the server sent the response, in UNIX time
     *      error: optional, a string specifying the error that occurred processing the request
     *      data: optional, an object whose members are the requested fields and their values. Only present if no error occurred.
     */
    K.getData = function ( field, callback )
    {
        _sendRequest( "GET", "users/data" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&session=" + encodeURIComponent( _internal.session ) +
            "&application=" + encodeURIComponent( _internal.application ) +
            "&field=" + encodeURIComponent( JSON.stringify( field ) ),
            function ( result )
            {
                _autoRelog( result, K.getData, 'K.getData()', [ field, callback ] );
            }
        );
    };

    /**
     * Removes user personal data from the Knecht server
     * @param field names of the data fields to be deleted
     * @param callback function that takes the response JSON object as its sole parameter. Valid members are:
     *      timestamp: the time at which the server sent the response, in UNIX time
     *      error: optional, a string specifying the error that occurred processing the request
     */
    K.deleteData = function ( field, callback )
    {
        _sendRequest( "DELETE", "users/data" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&session=" + encodeURIComponent( _internal.session ) +
            "&application=" + encodeURIComponent( _internal.application ) +
            "&field=" + encodeURIComponent( JSON.stringify( field ) ),
            function (result )
            {
                _autoRelog( result, K.deleteData, 'K.deleteData()', [ field, callback ] );
            }
        );
    };

    /**
     * Retrieves a list of Knecht groups that fit a set of constraints
     * @param constraints the constraints that determine which accounts are include in the list. Valid members are:
     *      username : user who must be a member of the group
     *      host : user who must be hosting the group
     *      group_name : string the group's name must match exactly
     *      application : application the game must be running
     * @param callback function that takes the response JSON object as its sole parameter. Valid members are:
     *      timestamp: the time at which the server sent the response, in UNIX time
     *      error: optional, a string specifying the error that occurred processing the request
     *      groups: optional, an array of groups meeting the request constraints
     */
    K.getGroups = function ( constraints, callback )
    {
        if( callback === undefined )
        {
            callback = constraints;
            constraints = undefined;
        }
        _sendRequest( "GET", "groups" +
            "?constraints=" + encodeURIComponent( JSON.stringify( constraints ) ),
            function ( result )
            {
                callback( result );
                if( result.error)
                {
                    _internal.error( 'K.getGroups()', result.error );
                }
            }
        );
    };

    /**
     * Initiates a group with the requesting user as host
     * @param group_name name to be given to the group
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in UNIX time
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.startGroup = function ( group_name, callback )
    {
        K.configure( { group_name : group_name });
        _sendRequest( "POST", "groups" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&session=" + encodeURIComponent( _internal.session ) +
            "&application=" + encodeURIComponent( _internal.application ) +
            "&group_name=" + encodeURIComponent( _internal.group_name ),
            function ( result )
            {
                _autoRelog( result, K.startGroup, 'K.startGroup()', [ group_name, callback ] );
            }
        );
    };

    /**
     * Closes a group that you are the host of and deletes all associated data
     * @param group_name name of the group to be closed
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in UNIX time
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.closeGroup = function ( group_name, callback )
    {
        if( callback === undefined )
        {
            callback = group_name;
            group_name = _internal.group_name;
        }
        _sendRequest( "DELETE","groups" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&session=" + encodeURIComponent( _internal.session ) +
            "&group_name=" + encodeURIComponent( group_name ) +
            "&application=" + encodeURIComponent( _internal.application ),
            function ( result )
            {
                _autoRelog(result, K.closeGroup, 'K.closeGroup()', [ group_name, callback ] );
            }
        );
    };

    /**
     * Subscribes to input from users to this group
     * @param group_name the name of the group to be subscribed to
     * @param clear previous inputs that can now be safely deleted
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in UNIX time
     *        error: if present, a string specifying the error that occurred processing the request
     *        input: array of inputs received
     *        clear: ids of inputs contained in this response
     */
    K.listenInput = function( group_name, clear, callback )
    {
        if( callback === undefined)
        {
            if(clear === undefined )
            {
                callback = group_name;
                group_name = _internal.group_name;
                clear = [];
            }
            else
            {
                callback = clear;
                if ( group_name instanceof Array)
                {
                    clear = group_name;
                    group_name = _internal.group_name;
                }
                else
                {
                    clear = [];
                }
            }
        }
        _sendRequest( "GET", "groups/input" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&session=" + encodeURIComponent( _internal.session ) +
            "&group_name=" + encodeURIComponent( group_name ) +
            "&application=" + encodeURIComponent( _internal.application ) +
            "&clear=" + encodeURIComponent( JSON.stringify(clear) ),
            function ( result )
            {
                _autoRelog( result, K.listenInput, 'K.listenInput()', [group_name, clear, callback] );
            }
        );
    };

    /**
     * Submits input to a group for processing by its host.
     * @param group_name the name of the group
     * @param input to send to the group's host
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in UNIX time
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.submitInput = function(group_name, input, callback)
    {
        if( callback === undefined)
        {
            callback = input;
            input = group_name;
            group_name = _internal.group_name;
        }
        _sendRequest( "POST", "groups/input" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&session=" + encodeURIComponent( _internal.session ) +
            "&group_name=" + encodeURIComponent(group_name) +
            "&application=" + encodeURIComponent( _internal.application ),
            input,
            function ( result )
            {
                _autoRelog( result, K.submitInput, 'K.submitInput()', [group_name, input, callback] );
            }
        );
    };

    /**
     * Subscribes to updates from this group
     * @param group_name the name of the group to be subscribed to
     * @param limit maximum size of individual value the server will send with its response
     * @param clear previous updates that can now be safely deleted
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in UNIX time
     *        error: if present, a string specifying the error that occurred processing the request
     *        field: array of updated fields
     *        data: object containing updated values of the above fields
     *        clear: ids of inputs contained in this response
     */
    K.listenUpdate = function( group_name, limit, clear, callback)
    { //account for left out variables
        if( callback === undefined )
        {
            if( clear === undefined )
            {
                if( limit === undefined )
                {//1 argument
                    callback = group_name;
                    group_name = _internal.group_name;
                    limit = Number.MAX_VALUE;
                    clear = [];
                }
                else
                {//2 arguments
                    callback = limit;
                    if ( typeof group_name === 'string')
                    {
                        limit = Number.MAX_VALUE;
                        clear = [];
                    }
                    else if ( typeof group_name === 'number')
                    {
                        limit = group_name;
                        group_name = _internal.group_name;
                        clear = [];
                    }
                    else
                    {
                        clear = group_name;
                        group_name = _internal.group_name;
                        limit = Number.MAX_VALUE;
                    }
                }
            }
            else
            {//3 arguments
                callback = clear;
                if ( typeof group_name === 'string')
                {//group name is present
                    if ( typeof limit === 'number' )
                    {//limit is present, clear must be missing
                        clear = [];
                    }
                    else
                    {//limit is missing
                        clear =  limit;
                        limit = Number.MAX_VALUE;
                    }
                }
                else
                { //group_name is missing
                    clear = limit;
                    limit = group_name;
                    group_name = _internal.group_name;
                }
            }
        }
        _sendRequest( "GET", "groups/updates" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&session=" + encodeURIComponent( _internal.session ) +
            "&group_name=" + encodeURIComponent(group_name) +
            "&application=" + encodeURIComponent( _internal.application ) +
            "&limit=" + encodeURIComponent(JSON.stringify(limit)) +
            "&clear=" + encodeURIComponent(JSON.stringify(clear)),
            function ( result )
            {
                _autoRelog( result, K.listenUpdate, 'K.listenUpdate()', [group_name, limit, clear, callback] );
            }
        );
    };

    /**
     * Allows the host of a group to post updated data and notify its members. Optionally, permissions may be set
     * @param group_name string identifying the group to be updated
     * @param field either a string or array of strings identifying the fields to be updated
     * @param data any object or array of objects containing the data to be stored. Of the same length as fields
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in UNIX time
     *        error: if present, a string specifying the error that occurred processing the request
     * @param member optional string or list of strings identifying the users whose permissions are being set
     * @param permission optional boolean, array of booleans, or array of arrays of booleans indicating whether members
     *        are allowed to access the corresponding data
     */
    K.submitUpdate = function(group_name, field, data, callback, member, permission)
    {
        if( typeof callback !== 'function' )
        {//group name left out
            permission = member;
            member = callback;
            callback = data;
            data = field;
            field = group_name;
            group_name = _internal.group_name;
        }
        var query = "groups/data" + "" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&session=" + encodeURIComponent( _internal.session ) +
            "&group_name=" + encodeURIComponent(group_name) +
            "&application=" + encodeURIComponent( _internal.application ) +
            "&field=" + encodeURIComponent(JSON.stringify(field));
        if(member)
        {
            query += "&member=" + encodeURIComponent(JSON.stringify(member));
        }
        if(permission)
        {
            query += "&permission=" + encodeURIComponent(JSON.stringify(permission));
        }
        _sendRequest( "PUT", query, data,
            function ( result )
            {
                _autoRelog(result, K.submitUpdate, 'K.submitUpdate()',
                    [ group_name, field, data, callback, member, permission ]);
            }
        );
    };

    /**
     * Cancels the requesting user's subscription to group notifications
     * @param group_name name of the subscribed group
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in UNIX time
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.stopListening = function ( group_name, callback )
    {
        if( callback === undefined )
        {
            callback = group_name;
            group_name = _internal.group_name;
        }
        _sendRequest( "DELETE", "groups/subscription" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&session=" + encodeURIComponent( _internal.session ) +
            "&group_name=" + encodeURIComponent( group_name ) +
            "&application=" + encodeURIComponent( _internal.application ),
            function ( result )
            {
                _autoRelog( result, K.stopListening, 'K.stopListening()', [ group_name, callback ] );
            }
        );
    }

    /**
     * Retrieves one or more shared data fields from the server
     * @param group_name string identifying the group the data belongs to
     * @param field string or array of strings identifying the data to be retrieved
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in milliseconds since midnight January 1, 1970
     *        error: if present, a string specifying the error that occurred processing the request
     *        data: if present, an object with members corresponding to the requested data
     */
    K.getGroupData = function( group_name, field, callback )
    {
        if ( callback === undefined )
        {
            callback = field;
            field = group_name;
            group_name = _internal.group_name;
        }
        _sendRequest( "GET", "groups/data" +
            "?username=" + encodeURIComponent( _internal.username ) +
            "&session=" + encodeURIComponent( _internal.session ) +
            "&group_name=" + encodeURIComponent( group_name ) +
            "&application=" + encodeURIComponent( _internal.application ) +
            "&field=" + encodeURIComponent( JSON.stringify( field ) ),
            function ( result )
            {
                _autoRelog( result, K.getGroupData, 'K.getGroupData()', [ group_name, field, callback ] );
            }
        );
    };

    /**
     * Changes the read permissions for group data fields and notifies members
     * @param group_name string identifying the group to be acted on
     * @param field string or array of strings identifying the fields being acted on
     * @param permission boolean, array of booleans, or array of booleans indicating whether the permission is granted or revoked
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in UNIX time
     *        error: if present, a string specifying the error that occurred processing the request
     * @param member optionally, a string or array of strings identifying the users the permissions are for
     */
    K.setPermission = function(group_name, field, permission, callback, member)
    {
        var query = "groups/data/permissions" +
            "?username=" + _internal.username +
            "&session=" + _internal.session +
            "&group_name=" + encodeURIComponent(group_name) +
            "&application=" + encodeURIComponent(_internal.application) +
            "&field=" + encodeURIComponent(JSON.stringify(field));
        if(member)
        {
            query += "&members=" + encodeURIComponent(JSON.stringify(member));
        }
        _sendRequest( "PUT", query,
            function (result )
            {
                _autoRelog(result, K.setPermission, 'K.setPermission()', [group_name, field, callback, member]);
            }
        );
    };

    /**
     * Adds a user to the list of members for a group
     * @param group_name string identifying the group to be added to
     * @param member string identifying the member to be added
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in UNIX time
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.addMember = function ( group_name, member, callback )
    {
        _sendRequest( "POST", "groups/members" +
            "?username=" + _internal.username +
            "&session=" + _internal.session +
            "&group_name=" + encodeURIComponent( group_name ) +
            "&application=" + encodeURIComponent( _internal.application ) +
            "&member=" + encodeURIComponent( member ),
            function ( result )
            {
                _autoRelog(result, K.addMember, 'K.addMember()', [group_name, member, callback]);
            }
        );
    };

    /**
     * Removes a user from the list of members for a group you are the host of
     * @param group_name string identifying the group
     * @param member string identifying the member to be removed
     * @param callback a function to be called once a response is received from the server
     *        callback must accept a single object as parameter, containing the following members:
     *        timestamp: the time at which the server sent the response, in UNIX time
     *        error: if present, a string specifying the error that occurred processing the request
     */
    K.removeMember = function ( group_name, member, callback )
    {
        _sendRequest( "DELETE", "groups/members" +
            "?username=" + _internal.username +
            "&session=" + _internal.session +
            "&group_name=" + encodeURIComponent( group_name ) +
            "&application=" + encodeURIComponent( _internal.application ) +
            "&member=" + encodeURIComponent( member ),
            function ( result )
            {
                _autoRelog(result, K.removeMember, 'K.removeMember()', [group_name, member, callback]);
            }
        );
    };

} () );
