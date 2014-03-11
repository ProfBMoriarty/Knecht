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
function beHost(){
    //swagfish
    /*position = "host";
    K.setAddress("localhost:8080");
    K.setApplication("multi_test");

    K.register("CainToad716@gmail.com", "SWAG", function(res){
        if(res.response === K.OK){
            PS.statusText("You are the host.");

            K.startGroup("m_test", "YOLOSWAG", function(res){
                if(res.response === K.OK){
                    PS.statusText("Group started");

                    K.addMember("m_test", "CainToad716@yahoo.com", function(res){
                        if(res.response === K.OK){
                            PS.statusText("Member Added");
                        }
                    });
                }
            });
        }
    });*/




}

function beUser(){
    //swagfish
    /*var to_read;
    var text_to_read;
    to_read = new XMLHttpRequest();
    to_read.onreadystatechange = function(){
        if(to_read.readyState == 4){
            if(to_read.status == 0 || to_read.status == 200){
                text_to_read = to_read.responseText;
            }
        }
    };

    to_read.open("GET", url.txt, true);
    to_read.send();
    PS.statusText(text_to_read);
    position = "client";*/

    /*K.setAddress("http://localhost:8080");
    K.setApplication("multi_test");

    K.register("CainToad716@yahoo.com", "SWAGFISH", function(res){
        if(res.response === K.OK){
            PS.statusText("You are the client.");
        }
    });*/
}

PS.init = function( system, options ) {
	"use strict";

	// Use PS.gridSize( x, y ) to set the grid to
	// the initial dimensions you want (32 x 32 maximum)
	// Do this FIRST to avoid problems!
	// Otherwise you will get the default 8x8 grid

	PS.gridSize( 8, 8 );
    for(var i = 0 ; i < 8 ; i += 1){
        if(i < 4){
            PS.color(i, PS.ALL, PS.COLOR_BLUE);
        }
        else {
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
    if(!has_chosen){
        if(PS.color(x,y) == PS.COLOR_BLUE){
            //beHost();
            position = "host";
            K.setAddress("localhost:8088");
            K.setApplication("multi_test");

            K.register("CainToad716@gmail.com", "SWAG", function(res){
                if(res.status === K.OK){
                    PS.statusText("You are the host.");

                    K.startGroup("m_test", "YOLOSWAG", function(res){
                        if(res.status === K.OK){
                            PS.statusText("Group started");

                            K.addMember("m_test", "CainToad716@yahoo.com", function(res){
                                if(res.status === K.OK){
                                    PS.statusText("Member Added");

                                    K.setPermissions("m_test", "area", true, function(response){
                                        if(response.status === K.OK){
                                            PS.statusText("Member granted permission");
                                        }
                                    }, "CainToad716@gmail.com");
                                }
                            });
                        }
                    });
                }
            });
        }

        if(PS.color(x,y) == PS.COLOR_RED){
            //beUser();
            position = "user";
            K.setAddress("http://localhost:8088");
            K.setApplication("multi_test");

            K.register("CainToad716@yahoo.com", "SWAGFISH", function(res){
                if(res.status === K.OK){
                    PS.statusText("You are the client.");
                }
            });
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
        if(key == PS.KEY_ARROW_DOWN){
        }
        if(key == PS.KEY_ARROW_UP){}
        if(key == PS.KEY_ARROW_LEFT){}
        if(key == PS.KEY_ARROW_RIGHT){}
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

