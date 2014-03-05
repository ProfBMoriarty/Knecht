// game.js for Perlenspiel 3.1

/*
Perlenspiel is a scheme by Professor Moriarty (bmoriarty@wpi.edu).
Perlenspiel is Copyright © 2009-14 Worcester Polytechnic Institute.
This file is part of Perlenspiel.

Perlenspiel is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Perlenspiel is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Lesser General Public License for more details.

You may have received a copy of the GNU Lesser General Public License
along with Perlenspiel. If not, see <http://www.gnu.org/licenses/>.
*/

// The following comment lines are for JSLint. Don't remove them!

/*jslint nomen: true, white: true */
/*global PS */

// This is a template for creating new Perlenspiel games

// All of the functions below MUST exist, or the engine will complain!

// PS.init( system, options )
// Initializes the game
// This function should normally begin with a call to PS.gridSize( x, y )
// where x and y are the desired initial dimensions of the grid
// [system] = an object containing engine and platform information; see documentation for details
// [options] = an object with optional parameters; see documentation for details

var has_chosen = false;
var position;
var user_x, user_y;
function beHost()
{
    //swagfish
    position = "host";
    K.setAddress("http://localhost:8088");
    K.setApplication("multi_test");

    K.register( "caintoad@gmail.com", "SWAG", function( response )
    {
       if ( response.status === K.OK )
        {
            PS.statusText("You are the host.");

            K.startGroup( "m_test", "YOLOSWAG", function( response )
            {
                if ( response.status === K.OK )
                {
                    PS.statusText("Group started");

                    K.addMember ( "m_test", "caintoad@yahoo.com", function( response )
                    {
                        if ( response.status === K.OK )
                        {
                            PS.statusText("Member Added");

                            K.setPermissions("m_test", "m_test", true, "mult_test", function(response){
                                if(response.status === K.OK){
                                    PS.statusText("Member given permissions")
                                }
                            }, "caintoad@yahoo.com");
                        }
                    });
                }
                else{
                    PS.statusText("Group not started");
                }
            });
        }
        else{
            PS.statusText("Unable to register");
        }
    });



    PS.timerStart(60000, function(){
        K.submitUpdate("m_test", "mult_test", {"X": user_x, "Y": user_y}, function(response){});
        K.listenInputs("m_test", function(result){
            var l = result.body;
            var i;
            var point;
            for(i=0; i<l.length; i += 1){
                point = (l[i]).input;
                PS.glyph(5, PS.ALL, " ");
                PS.glyph(6, PS.ALL, " ");
                PS.glyph(7, PS.ALL, " ");

                PS.glyph(point.X, point.Y, "O");
            }
        });
    });

    user_x = 1;
    user_y = 3;
}

function beUser(){
    //swagfish
    position = "client";
    K.setAddress("http://localhost:8080");
    K.setApplication("multi_test");

    K.register("caintoad@yahoo.com", "SWAGFISH", function(response){
        if( response.result === K.OK )
        {
            PS.statusText("You are the client.");
        }
    });

    user_x = 6;
    user_y = 3;

    PS.timerStart(60, function(){
        K.submitInput("m_test", {"X": user_x, "Y": user_y}, function(response){});
        K.listenUpdates("m_test", function(result){
            var l = result.body;
            var i;
            var point;
            for(i=0; i<l.length; i += 1){
                point = (l[i]).input;
                PS.glyph(0, PS.ALL, " ");
                PS.glyph(1, PS.ALL, " ");
                PS.glyph(2, PS.ALL, " ");

                PS.glyph(point.X, point.Y, "O");
            }
        });
    });
}

PS.init = function( system, options ) {
	"use strict";
	var i;

	// Use PS.gridSize( x, y ) to set the grid to
	// the initial dimensions you want (32 x 32 maximum)
	// Do this FIRST to avoid problems!
	// Otherwise you will get the default 8x8 grid

	PS.gridSize( 8, 8 );
    for( i = 0 ; i < 8 ; i += 1 )
    {
        if ( i < 4 )
        {
            PS.color(i, PS.ALL, PS.COLOR_BLUE);
        }
        else
        {
            PS.color(i, PS.ALL, PS.COLOR_RED);
        }
    }

	// Add any other initialization code you need here
};

// PS.touch ( x, y, data, options )
// Called when the mouse button is clicked on a bead, or when a bead is touched
// It doesn't have to do anything
// [x] = zero-based x-position of the bead on the grid
// [y] = zero-based y-position of the bead on the grid
// [data] = the data value associated with this bead, 0 if none has been set
// [options] = an object with optional parameters; see documentation for details

PS.touch = function( x, y, data, options ) {
	"use strict";

	// Uncomment the following line to inspect parameters
	// PS.debug( "PS.touch() @ " + x + ", " + y + "\n" );

	// Add code here for mouse clicks/touches over a bead
    if( !has_chosen )
    {
        if(PS.color(x,y) == PS.COLOR_BLUE){
            beHost();
        }
        if(PS.color(x,y) == PS.COLOR_RED){
            beUser();
        }
        has_chosen = true;

        PS.color(PS.ALL,PS.ALL,PS.COLOR_WHITE);
        PS.color(3,PS.ALL,PS.COLOR_BLACK);
        PS.color(4,PS.ALL,PS.COLOR_BLACK);
    }
};

// PS.release ( x, y, data, options )
// Called when the mouse button is released over a bead, or when a touch is lifted off a bead
// It doesn't have to do anything
// [x] = zero-based x-position of the bead on the grid
// [y] = zero-based y-position of the bead on the grid
// [data] = the data value associated with this bead, 0 if none has been set
// [options] = an object with optional parameters; see documentation for details

PS.release = function( x, y, data, options ) {
	"use strict";

	// Uncomment the following line to inspect parameters
	// PS.debug( "PS.release() @ " + x + ", " + y + "\n" );

	// Add code here for when the mouse button/touch is released over a bead
};

// PS.enter ( x, y, button, data, options )
// Called when the mouse/touch enters a bead
// It doesn't have to do anything
// [x] = zero-based x-position of the bead on the grid
// [y] = zero-based y-position of the bead on the grid
// [data] = the data value associated with this bead, 0 if none has been set
// [options] = an object with optional parameters; see documentation for details

PS.enter = function( x, y, data, options ) {
	"use strict";

	// Uncomment the following line to inspect parameters
	// PS.debug( "PS.enter() @ " + x + ", " + y + "\n" );

	// Add code here for when the mouse cursor/touch enters a bead
};

// PS.exit ( x, y, data, options )
// Called when the mouse cursor/touch exits a bead
// It doesn't have to do anything
// [x] = zero-based x-position of the bead on the grid
// [y] = zero-based y-position of the bead on the grid
// [data] = the data value associated with this bead, 0 if none has been set
// [options] = an object with optional parameters; see documentation for details

PS.exit = function( x, y, data, options ) {
	"use strict";

	// Uncomment the following line to inspect parameters
	// PS.debug( "PS.exit() @ " + x + ", " + y + "\n" );

	// Add code here for when the mouse cursor/touch exits a bead
};

// PS.exitGrid ( options )
// Called when the mouse cursor/touch exits the grid perimeter
// It doesn't have to do anything
// [options] = an object with optional parameters; see documentation for details

PS.exitGrid = function( options ) {
	"use strict";

	// Uncomment the following line to verify operation
	// PS.debug( "PS.exitGrid() called\n" );

	// Add code here for when the mouse cursor/touch moves off the grid
};

// PS.keyDown ( key, shift, ctrl, options )
// Called when a key on the keyboard is pressed
// It doesn't have to do anything
// [key] = ASCII code of the pressed key, or one of the following constants:
// Arrow keys = PS.ARROW_UP, PS.ARROW_DOWN, PS.ARROW_LEFT, PS.ARROW_RIGHT
// Function keys = PS.F1 through PS.F1
// [shift] = true if shift key is held down, else false
// [ctrl] = true if control key is held down, else false
// [options] = an object with optional parameters; see documentation for details

PS.keyDown = function( key, shift, ctrl, options ) {
	"use strict";

	// Uncomment the following line to inspect parameters

//	PS.debug( "DOWN: key = " + key + ", shift = " + shift + "\n" );

//	if ( ( key !== okey ) || ( shift !== oshift ) )
//	{
//		okey = key;
//		oshift = shift;
//		PS.debug( "DOWN: key = " + key + ", shift = " + shift + "\n" );
//	}

	// Add code here for when a key is pressed
    if(has_chosen){
        PS.glyph(user_x, user_y, " ");
        if(key == PS.KEY_ARROW_DOWN){
            if(user_y < 7){
                user_y += 1;
            }
        }
        if(key == PS.KEY_ARROW_UP){
            if(user_y > 0){
                user_y -= 1;
            }
        }
        if(key == PS.KEY_ARROW_LEFT){
            if(user_x > 0){
                if(PS.color((user_x - 1), user_y) != PS.COLOR_BLACK){
                    user_x -= 1;
                }
            }
        }
        if(key == PS.KEY_ARROW_RIGHT){
            if(user_x < 7){
                if(PS.color((user_x + 1), user_y) != PS.COLOR_BLACK){
                    user_x += 1;
                }
            }
        }
        PS.glyph(user_x, user_y, "X");
    }
};

// PS.keyUp ( key, shift, ctrl, options )
// Called when a key on the keyboard is released
// It doesn't have to do anything
// [key] = ASCII code of the pressed key, or one of the following constants:
// Arrow keys = PS.ARROW_UP, PS.ARROW_DOWN, PS.ARROW_LEFT, PS.ARROW_RIGHT
// Function keys = PS.F1 through PS.F12
// [shift] = true if shift key is held down, false otherwise
// [ctrl] = true if control key is held down, false otherwise
// [options] = an object with optional parameters; see documentation for details

PS.keyUp = function( key, shift, ctrl, options ) {
	"use strict";

	// Uncomment the following line to inspect parameters
	// PS.debug( "PS.keyUp(): key = " + key + ", shift = " + shift + ", ctrl = " + ctrl + "\n" );

	// Add code here for when a key is released
};

// PS.input ( sensors, options )
// Called when an input device event (other than mouse/touch/keyboard) is detected
// It doesn't have to do anything
// [sensors] = an object with sensor information; see documentation for details
// [options] = an object with optional parameters; see documentation for details

PS.input = function( sensors, options ) {
	"use strict";

	// Uncomment the following block to inspect parameters
	/*
	PS.debug( "PS.input() called\n" );
	var device = sensors.wheel; // check for scroll wheel
	if ( device )
	{
		PS.debug( "sensors.wheel = " + device + "\n" );
	}
	*/

	// Add code here for when an input event is detected
};