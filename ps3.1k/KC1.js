var K = {};

(function ()
{
//region Globals
	//these variables are used to track qualities that rarely change between requests so the application doesn't have to
	//continuously pass them into the functions

	var _address = null;  //the address of the server

	//the name of the application; all versions of a client that want to talk to each other should use the exact same name

	var _app = null;
	var _email = null; // the user's email address serving as the name of his account.
	var _password = null; // the user's password, used to validate the account
	var _session_id = null; // the authentication token from the most recent login

	var XMLHttpRequest = require( "xmlhttprequest" ).XMLHttpRequest;  //require the browser to load AJAX so requests can be made
//endregion

//region Constants
	//standard response codes
	K.responses = {
		200 : "K.OK", //this indicates that the request was successful; if it was a get request it will be accompanied by
		//the requested value
		401 : "K.UNAUTH", //this indicates that the request could not be carried out, either because the correct password
		//was not used or the user does not have permission to make the request
		403 : "K.INVALID", //this indicates that the parameters of the request are invalid, perhaps because a field that
		//must be unique is already in use or a field to be retrieved does not exist
		500 : "K.ERROR" //this indicates that an unknown error has occurred, perhaps because of connection failure
	};
	K.OK = K.responses[200];
	K.UNAUTH = K.responses[401];
	K.INVALID = K.responses[403];
	K.ERROR = K.responses[500];

//endregion

//region Config Functions
	//this function specifies the address of the server; it must be called before any requests can be made
	//the address variable is the web URI of the server that requests are to be sent to
	//this function returns nothing

	K.setAddress = function ( address )
	{
		_address = encodeURI( address ); // user input must be sanitized before it can be included in the URI
	};

	//this function specifies the name of the running application; applications with different names can not access data
	//stored under the name of this application
	//this function returns nothing

	K.setApplication = function ( app )
	{
		_app = encodeURIComponent( app );  //user input must be sanitized before it can be included in the URI
	};

//endregion

//region Users functions
	//these functions deal with managing user accounts and are application independent

	//this function verifies that the given email is not already in use and therefore can be used to make a new account
	//the email parameter is a string that is an email to be checked against the registered email addresses
	//email can be a valid email address, in which case the password can be recovered to it, but it need not be
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is true if the email is free to use or false if it invalid
	//if an error is encountered, K.ERROR is passed to callback instead
	//this function returns nothing
	K.checkUser = function ( email, callback )
	{
		_sendRequest( "GET", "/users?email=" + encodeURIComponent( email ), function ( status, result )
		{
			if ( K.responses[status] === K.OK )
			{
				result['result'] = true;
			}
			else if ( K.responses[status] === K.INVALID )
			{
				result['result'] = false;
			}
			else
			{
				result['result'] = K.ERROR;
			}
			callback( result );
		} );
	};

	//this function creates a new account with the given username and password
	//the email parameter is a string that will identify this account in the future
	//the password parameter is a string that will be used to access this account in the future
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing

	K.register = function ( email, password, callback, timeout )
	{
		_email = encodeURIComponent( email );
		_password = password;
		if ( !timeout )
		{
			timeout = 15;
		}
		_sendRequest( "POST", "/users?email=" + _email + "&timeout=" + encodeURIComponent( timeout ),
		              function ( status, result )
		              {
			              if ( K.responses[status] === K.OK )
			              {
				              _session_id = encodeURIComponent( result.body );
			              }
			              callback( {timestamp : result.timestamp, result : K.responses[status]} );
		              }, _password );
	};

	//this function logs into an existing account with the given username and password
	//the email parameter is the string that was previously used to identify this account
	//the password parameter is the string that was used when the account was created
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing
	//note that the server does not track which users are logged in; rather this function merely stores the given
	//username and password for future calls and verifies that they are a valid pair
	K.login = function ( email, password, callback )
	{
		_session_id = null; //TODO: logout function
		_email = encodeURIComponent( email );
		_password = password;
		_sendRequest( "PUT", "/users?email=" + _email, function ( status, result )
		{
			if ( K.responses[status] === K.OK )
			{
				_session_id = encodeURIComponent( result.body );
			}
			callback( {timestamp : result.timestamp, result : K.responses[status]} );
		}, _password );
	};

	//this function sends a password recovery email to the specified address
	//the email parameter is the name of the account the password of which is to be recovered
	//it must also be a valid email address for this function
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing
	K.recoverPassword = function ( email, callback )
	{
		_sendRequest( "GET", "/users/password?email=" + encodeURIComponent( email ), function ( status )
		{
			callback( K.responses[status] );
		} );
	};

	//this function changes the password of a previously created account
	//the the login function must have been previously called to login to the account of which the password will be changed
	//the password parameter is a string that is the new password of the currently logged in account
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing
	K.changePassword = function ( password, callback )
	{
		_sendRequest( "PUT", "/users/password?session_id=" + _session_id, function ( status, result )
		{
			if ( K.responses[status] === K.OK )
			{
				_password = password;
			}
			callback( {timestamp : result.timestamp, result : K.responses[status]} );
		}, password );
	};

	//this function removes the current account and all data associated with it from the server
	//the the login function must have been previously called to login to the account to be deleted
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing
	//note: this function can not be undo; take care not to call it lightly
	K.unregister = function ( callback )
	{
		_sendRequest( "DELETE", "/users?session_id=" + _session_id, function ( status, result )
		{
			if ( K.responses[status] === K.UNAUTH )
			{
				K.login( _email, _password, function ( result )
				{
					if ( result.result === K.OK )
					{
						K.unregister( callback );
					}
					else
					{
						callback( {timestamp : result.timestamp, result : K.UNAUTH} );
					}
				} );
			}
			else
			{
				callback( {timestamp : result.timestamp, result : K.responses[status]} );
			}
		} );
	};
	//endregion

	//region User Data functions
	//These functions deal with managing data on the server that does not need to be seen by more than one client
	//immediately upon being stored.  Only data for the current user and application can be accessed.

	//this function stores an arbitrary object on the server for later retrieval
	//the field parameter is a string that is the name by which the stored object can be retrieved by in the future
	//the data parameter is an object to be stored on the database in JSON.
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing
	//note that if an object is already stored under the name of the given field, it is overwritten
	K.putData = function ( field, data, callback )
	{
		_sendRequest( "PUT", "/users/data?session_id=" + _session_id +
			"&app=" + _app + "&field=" + encodeURIComponent( field ), function ( status, result )
		              {
			              if ( K.responses[status] === K.UNAUTH )
			              {
				              K.login( _email, _password, function ( result )
				              {
					              if ( result.result === K.OK )
					              {
						              K.putData( field, data, callback );
					              }
					              else
					              {
						              callback( {timestamp : result.timestamp, result : K.UNAUTH} );
					              }
				              } );
			              }
			              else
			              {
				              callback( {timestamp : result.timestamp, result : K.responses[status]} );
			              }
		              }, data );
	};

	//this function retrieves an object previously stored on the server with the putData function
	//the field parameter is a string that is the name by which the stored object was stored
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the stored object if it could be retrieved
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section if the stored object could not be retrieved
	//this function returns nothing
	K.getData = function ( field, callback )
	{
		_sendRequest( "GET", "/users/data?session_id=" + _session_id +
			"&app=" + _app + "&field=" + encodeURIComponent( field ), function ( status, result )
		              {
			              if ( K.responses[status] === K.UNAUTH )
			              {
				              K.login( _email, _password, function ( result )
				              {
					              if ( result.result === K.OK )
					              {
						              K.getData( field, callback );
					              }
					              else
					              {
						              callback( {timestamp : result.timestamp, result : K.UNAUTH} );
					              }
				              } );
			              }
			              else if ( K.responses[status] === K.OK )
			              {
				              callback( {timestamp : result.timestamp, result : result.body} );
			              }
			              else
			              {
				              callback( {timestamp : result.timestamp, result : K.responses[status]} );
			              }
		              } );
	};

	//this function deletes an object previously stored on the server with the putData function
	//the field parameter is a string that is the name by which the stored object was stored
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing
	K.deleteData = function ( field, callback )
	{
		_sendRequest( "DELETE", "/users/data?session_id=" + _session_id +
			"&app=" + _app + "&field=" + encodeURIComponent( field ), function ( status, result )
		              {
			              if ( K.responses[status] === K.UNAUTH )
			              {
				              K.login( _email, _password, function ( result )
				              {
					              if ( result.result === K.OK )
					              {
						              K.deleteData( field, callback );
					              }
					              else
					              {
						              callback( {timestamp : result.timestamp, result : K.UNAUTH} );
					              }
				              } );
			              }
			              else
			              {
				              callback( {timestamp : result.timestamp, result : K.responses[status]} );
			              }
		              } );
	};
	//endregion

	//region Groups functions
	//These functions deal with managing data on the server that other clients need to be alerted to real time
	//immediately upon being stored.  The intention is that these functions will be used to allow users running separate
	//instances of an application to participate in the same game.

	//region Host functions
	//These functions are used by the application moderating the session.  The host is expected to moderate game logic
	//because there is no way to validate the integrity of the guest clients.

	//this function initiates a group on the server so that updates may be sent to its members real time
	//the group parameter is a string that is the name by which the newly created group will be referred to by in the future
	//the grouppass parameter is a string that is the password that is currently never referenced; once the request
	//entry function is implemented perspective members will have to give this password TODO:update this comment once that is implemented
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing
	//note that the account that is logged in when this function is called becomes the host of the created group
	K.startGroup = function ( group, grouppass, callback )
	{
		_sendRequest( "POST", "/groups?session_id=" + _session_id + "&app=" + _app + "&group=" + encodeURIComponent( group ),
		              function ( status, result )
		              {
			              if ( K.responses[status] === K.UNAUTH )
			              {
				              K.login( _email, _password, function ( result )
				              {
					              if ( result.result === K.OK )
					              {
						              K.startGroup( group, grouppass, callback );
					              }
					              else
					              {
						              callback( {timestamp : result.timestamp, result : K.UNAUTH} );
					              }
				              } );
			              }
			              else
			              {
				              callback( {timestamp : result.timestamp, result : K.responses[status]} );
			              }
		              }, grouppass );
	};

	//this function ends the group, deleting any queued messages or stored group data
	//the group parameter is a string that is the name of the group to close
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing
	//note that only the host of the group can close it
	//note that this cannot be undone; take care not to call this function prematurely
	K.closeGroup = function ( group, callback )
	{
		_sendRequest( "DELETE", "/groups?session_id=" + _session_id + "&group=" + encodeURIComponent( group ),
		              function ( status, result )
		              {
			              if ( K.responses[status] === K.UNAUTH )
			              {
				              K.login( _email, _password, function ( result )
				              {
					              if ( result.result === K.OK )
					              {
						              K.closeGroup( group, callback );
					              }
					              else
					              {
						              callback( {timestamp : result.timestamp, result : K.UNAUTH} );
					              }
				              } );
			              }
			              else
			              {
				              callback( {timestamp : result.timestamp, result : K.responses[status]} );
			              }
		              } );
	};

	//this function adds a new member to a group; this means that updates will be sent to them but the member must first
	//call listenUpdates to receive any of them
	//the group parameter is a string that is the name of the group to add the new member to
	//the email parameter is the username of the member to be added
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing
	//note that only the host of the group can add members to it
	K.addMember = function ( group, email, callback )
	{
		_sendRequest( "POST", "/groups/members?session_id=" + _session_id +
			"&group=" + encodeURIComponent( group ) + "&email=" + encodeURIComponent( email ),
		              function ( status, result )
		              {
			              if ( K.responses[status] === K.UNAUTH )
			              {
				              K.login( _email, _password, function ( result )
				              {
					              if ( result.result === K.OK )
					              {
						              K.addMember( group, email, callback );
					              }
					              else
					              {
						              callback( {timestamp : result.timestamp, result : K.UNAUTH} );
					              }
				              } );
			              }
			              else
			              {
				              callback( {timestamp : result.timestamp, result : K.responses[status]} );
			              }
		              } );
	};

	//this function gets an array of the members within a group, starting with the host at index 0
	//the group parameter is a string that is the name of the group the members of which are to be retrieved
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section if the list could not be retrieved
	//the callback function must take an array of strings that are the names of the members of the group
	//this function returns nothing
	//note that the client calling this function need not be a member of the group
	K.listMembers = function ( group, callback )
	{
		_sendRequest( "GET", "/groups/members?group=" + encodeURIComponent( group ), function ( status, result )
		{
			if ( K.responses[status] = K.OK )
			{
				callback( {timestamp : result.timestamp, result : result.body} );
			}
			else
			{
				callback( {timestamp : result.timestamp, result : K.responses[status]} );
			}
		} );
	};

	//this function removes a member from a group
	//the group parameter is a string that is the name of the group the members is to be removed from
	//the email parameter is the username of the member to be removed
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing
	//note that this function deletes any pending updates for the removed member; be careful not to call this function
	//too early
	K.removeMember = function ( group, email, callback )
	{
		_sendRequest( "DELETE", "/groups/members?session_id=" + _session_id +
			"&group=" + encodeURIComponent( group ) + "&email=" + encodeURIComponent( email ),
		              function ( status, result )
		              {
			              if ( K.responses[status] === K.UNAUTH )
			              {
				              K.login( _email, _password, function ( result )
				              {
					              if ( result.result === K.OK )
					              {
						              K.removeMember( group, email, callback );
					              }
					              else
					              {
						              callback( {timestamp : result.timestamp, result : K.UNAUTH} );
					              }
				              } );
			              }
			              else
			              {
				              callback( {timestamp : result.timestamp, result : K.responses[status]} );
			              }
		              } );
	};

	//this function stores an object on the server and alerts all members of the group that it has been posted
	//the group parameter is a string that is the name of the group to which the update should be sent
	//the field parameter is the name by which this object will be referred by in the future; it is included in the
	//update sent to the members
	//the data field is the object to be stored on the server
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing
	//note that if an object already exists in the group's name with the given field it is overwritten
	//note that in the future a permissions field will be added to this function; until it is, no members will actually
	//be alerted
	//note that only the host may use this function
	K.submitUpdate = function ( group, field, data, callback )
	{
		_sendRequest( "PUT", "/groups/data?session_id=" + _session_id +
			"&group=" + encodeURIComponent( group ) + "&field=" + encodeURIComponent( field ), function ( status )
		              {
			              callback( K.responses[status] );
		              }, data );
	};

	//this function retrieves data from the server that is allocated to the group
	//the group parameter is a string that is the name of the group the data is associated with
	//the field parameter is the name by which this object was referred to when it was submitted by the host
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section if the server does not produce the requested data for some reason
	//the callback function must take the requested object if it could be retrieved
	//this function returns nothing
	//note that this function can be called by either the host or members but members must have permission
	K.getGroupData = function ( group, field, callback )
	{
		_sendRequest( "GET", "/groups/data?session_id=" + _session_id +
			"&group=" + encodeURIComponent( group ) + "&field=" + encodeURIComponent( field ), function ( status, result )
		              {
			              if ( K.responses[status] === K.OK )
			              {
				              callback( result );
			              }
			              else
			              {
				              callback( K.responses[status] );
			              }
		              } );
	};

	//this function grants a member permission to view a specific object stored on the server in the group's name
	//the group parameter is a string that is the name of the group the data is associated with
	//the user parameter is a string that is the username of the member who is to be granted permission to retrieve the data
	//the field parameter is a string that is the name the data was given when it was placed on the server
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing
	//note that only the host can call this function
	//note that the member granted permission is not automatically alerted
	K.grantPermission = function ( group, user, field, callback )
	{
		_sendRequest( "PUT", "/groups/data/permissions?session_id=" + _session_id +
			"&group=" + encodeURIComponent( group ) + "&email=" + encodeURIComponent( user ) +
			"&field=" + encodeURIComponent( field ), function ( status )
		              {
			              callback( K.responses[status] );
		              } );
	};

	//this function removes a member's permission to view a specific object stored on the server in the group's name
	//the group parameter is a string that is the name of the group the data is associated with
	//the user parameter is a string that is the username of the member whose permission to retrieve the data is to be
	//revoked
	//the field parameter is a string that is the name the data was given when it was placed on the server
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing
	//note that only the host can call this function
	//note that the member denied permission is not automatically alerted
	K.revokePermission = function ( group, user, field, callback )
	{
		_sendRequest( "DELETE", "/groups/data/permissions?session_id=" + _session_id +
			"&group=" + encodeURIComponent( group ) + "&email=" + encodeURIComponent( user ) +
			"&field=" + encodeURIComponent( field ), function ( status )
		              {
			              callback( K.responses[status] );
		              } );
	};

	//this function sends an httprequest that waits for a messages from members
	//the group parameter is a string that is the name of the group to listen to; the currently logged in user must be
	//the host of this group
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section if inputs can not be heard
	//the callback function must take an array of objects representing member input; each object has three properties
	//  user which is a string that is the username of the member that issued the input
	//  input which is an object of a format specific to the application
	//  time which is a number that is a timestamp of when the input was received by the server
	//this function returns nothing
	//note that only the host can call this function
	//note that because this function is tail recursive so it needs to only be called once by the application unless it
	//encounters an error in which case the code is passed to the callback function
	K.listenInputs = function ( group, callback )
	{
		_sendRequest( "GET", "/groups/input?session_id=" + _session_id + "&group=" + encodeURIComponent( group ) +
			"&time=" + new Date().getTime(), function ( status, data )
		              {
			              if ( data )
			              {
				              callback( data );
			              }
			              else
			              {
				              callback( K.responses[status] );
			              }
			              if ( K.responses[status] === K.OK )
			              {
				              K.listenInputs( group, callback );
			              }
		              } );
	};

	//endregion

	//region Member functions
	//These functions are called by clients who are members of a group.  Note that the host is expected to manage all of
	//the game logic.  Members may be able to use some Host functions.  See the header comments of individual functions
	//for details

	//this function gets an array of strings that are the names off all active groups that are using the same app as the
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing
	K.listGroups = function ( callback )
	{
		_sendRequest( "GET", "/groups?app=" + _app, function ( status, result )
		{
			if ( K.responses[status] = K.OK )
			{
				callback( result );
			}
			else
			{
				callback( K.responses[status] );
			}
		} );
	};

	//this functions sends an object to the host of a group representing the member's input
	//the group parameter is a string that is the name of the group to whose host will receive the input
	//the data parameter is an object that is a message to the host in a format specific to the application
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section
	//this function returns nothing
	K.submitInput = function ( group, data, callback )
	{
		_sendRequest( "POST", "/groups/input?session_id=" + _session_id +
			"&group=" + encodeURIComponent( group ), function ( status )
		              {
			              callback( K.responses[status] );
		              }, data );
	};

	//this function sends an httprequest that waits for a messages from the host
	//the group parameter is a string that is the name of the group to listen to; the currently logged in user need not
	//be  a member of this group but if he is not no updates will be received
	//the callback parameter is a function that is called asynchronously once a response is received from the server
	//the callback function must take one parameter that is the response code from the server as defined in the
	//Constants section if inputs can not be heard
	//the callback function must take an array of strings that are the names of fields of group data that have been
	//updated; fields are only listed if this user was explicitly granted permission when the update was submitted
	//this function returns nothing
	//note that because this function is tail recursive so it needs to only be called once by the application unless it
	//encounters an error in which case the code is passed to the callback function
	//note that this function does not access the update itself in any way; it is intended that the callback function
	//will call the getGroupData function from the Host section to access the update
	K.listenUpdates = function ( group, callback )
	{
		_sendRequest( "GET", "/groups/updates?session_id=" + _session_id +
			"&group=" + encodeURIComponent( group ) +
			"&email=" + encodeURIComponent( _email ) +
			"&time=" + new Date().getTime(), function ( status, data )
		              {
			              if ( data )
			              {
				              callback( data );
			              }
			              else
			              {
				              callback( K.responses[status] );
			              }
			              if ( K.responses[status] === K.OK )
			              {
				              K.listenInputs( group, callback );
			              }
		              } );
	};

	//endregion

	//endregion

	//region Helper functions
	//these functions are used by the other functions in this document; they are not invoked by the application under
	//normal circumstances

	//this function sends an Ajax request to the server
	//the method parameter is a string that is an http request protocol
	//the path parameter is the URI the request should be sent to; since the server uses a restful API, the server
	//function is in this string
	//the callback parameter is a function that takes the following parameters
	//  a response code as defined in the Constants section indicating the success or failure of the request
	//  an optional object that is the value returned from the server if one is returned
	//the callback function is invoked when a response is received from the server
	//the optional body parameter is an object that is sent to the server in the body of the Ajax request
	//this function returns nothing
	//note that applications should not call this function directly
	function _sendRequest ( method, path, callback, body )
	{
		var request = new XMLHttpRequest();
		request.onreadystatechange = function ()
		{
			if ( request.readyState === request.DONE )
			{
				callback( request.status, JSON.parse( request.responseText ) );
			}
		};
		request.open( method, _address + path, true );
		request.send( JSON.stringify( body ) );
	}

	//endregion
}() );

/*
var u1 = 'u1';

var u2 = 'u2';
var p1 = 'p1';
var p2 = 'p2';
var p3 = 'p3';
var f1 = 'f1';
var d1 = 'd1';
var g1 = 'g1';
var g2 = 'g2';

K.setAddress("http://localhost:8080");
K.setApplication("a");

K.register(u2, p2, function(r){
    K.register(u1, p1, function(r){
        K.startGroup(g1, p3, function(r){
            console.log(JSON.stringify(r));
            K.listMembers(g1, function(r){
                console.log(JSON.stringify(r));
                K.addMember(g1, u2, function(r){
                    console.log(JSON.stringify(r));
                    K.listMembers(g1, function(r){
                        console.log(JSON.stringify(r));
                        K.addMember(g1, u2, function(r){
                            console.log(JSON.stringify(r));
                            K.listMembers(g1, function(r){
                                console.log(JSON.stringify(r));
                                K.removeMember(g1, u1, function(r){
                                    console.log(JSON.stringify(r));
                                    K.listMembers(g1, function(r){
                                        console.log(JSON.stringify(r));
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
 */