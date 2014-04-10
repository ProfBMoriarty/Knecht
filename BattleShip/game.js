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

var field_x = 6;
var field_y = 1;
var s_select = null;
var p_view = new Array(10);
for(var i=0; i<10; i+=1){
    p_view[i] = new Array(10);
}

function flood(x, y, color_a, color_b){
    if(PS.color(x, y) == color_a){
        PS.color(x, y, color_b);
        flood(x+1, y, color_a, color_b);
        flood(x-1, y, color_a, color_b);
        flood(x, y+1, color_a, color_b);
        flood(x, y-1, color_a, color_b);

    }
}

function within_field(x, y){
    if((x >= field_x) && ( x< (field_x + 10))){
        if((y >= field_y) && (y < (field_y + 10))){
            return true;
        }
        else{
            return false;
        }
    }
    else{
        return false;
    }
}

function check_collide(x, y, orient, size, left){
    if(orient == "vert"){
        if(PS.color(x, y) == PS.COLOR_CYAN){
            if(left < (size - 1)){
                return check_collide(x, y+1, orient, size, left+1);
            }
            else{
                return true;
            }
        }
        else{
            return false;
        }
    }
    if(orient == "horiz"){
        if(PS.color(x, y) == PS.COLOR_CYAN){
            if(left < (size - 1)){
                return check_collide(x+1, y, orient, size, left+1);
            }
            else{
                return true;
            }
        }
        else{
            return false;
        }
    }
    //this should never happen
    return false;
}

// All of the functions below MUST exist, or the engine will complain!

// PS.init( system, options )
// Initializes the game
// This function should normally begin with a call to PS.gridSize( x, y )
// where x and y are the desired initial dimensions of the grid
// [system] = an object containing engine and platform information; see documentation for details
// [options] = an object with optional parameters; see documentation for details
function has_border(x, y){
    return PS.border(x, y, PS.CURRENT);
}
PS.init = function( system, options ) {
	"use strict";

	// Use PS.gridSize( x, y ) to set the grid to
	// the initial dimensions you want (32 x 32 maximum)
	// Do this FIRST to avoid problems!
	// Otherwise you will get the default 8x8 grid

	PS.gridSize( 22, 12 );
    PS.border(PS.ALL, PS.ALL, 0);
    //The Playing field
    PS.applyRect(field_x, field_y, 10, 10, PS.color, PS.COLOR_CYAN);
    PS.applyRect(field_x, field_y, 10, 10, PS.border, PS.DEFAULT);

    for(var i=0; i<10; i += 1){
        for(var j=0; j<10; j += 1){
            p_view[i][j] = PS.COLOR_CYAN;
        }
    }

    //the border
    PS.applyRect(5, 0, 12, 1, PS.color, PS.COLOR_BLACK);
    PS.applyRect(5, 0, 1, 12, PS.color, PS.COLOR_BLACK);
    PS.applyRect(16, 0, 1, 12, PS.color, PS.COLOR_BLACK);
    PS.applyRect(5, 11, 12, 1, PS.color, PS.COLOR_BLACK);

    //The buttons
    PS.applyRect(1, 1, 3, 1, PS.color, PS.COLOR_RED);

    PS.applyRect(1, 3, 3, 1, PS.color, PS.COLOR_GREEN);

    PS.applyRect(1, 5, 3, 1, PS.color, PS.COLOR_BLACK);


    //The ships
    PS.applyRect(18, 1, 3, 1, PS.color, PS.COLOR_GRAY_DARK);
    PS.applyRect(18, 1, 3, 1, PS.data, {"S": 1, "H": 3, "I": "horiz"});

    PS.applyRect(18, 3, 1, 2, PS.color, PS.COLOR_GRAY_DARK);
    PS.applyRect(18, 3, 1, 2, PS.data, {"S": 2, "H": 2, "I": "vert"});

    PS.applyRect(18, 6, 1, 5, PS.color, PS.COLOR_GRAY_DARK);
    PS.applyRect(18, 6, 1, 5, PS.data, {"S": 3, "H": 5, "I": "vert"});

    PS.applyRect(20, 3, 1, 3, PS.color, PS.COLOR_GRAY_DARK);
    PS.applyRect(20, 3, 1, 3, PS.data, {"S": 4, "H": 3, "I": "vert"});

    PS.applyRect(20, 7, 1, 4, PS.color, PS.COLOR_GRAY_DARK);
    PS.applyRect(20, 7, 1, 4, PS.data, {"S": 5, "H": 4, "I": "vert"});
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

    if(PS.color(x,y) == PS.COLOR_GRAY_DARK){
        if(within_field(x, y)){
            for(var i=0; i<10; i += 1){
                for(var j=0; j<10; j += 1){
                    p_view[i][j] = PS.color(i + field_x, j+field_y);
                }
            }
            s_select = null;
        }
        else{
            s_select = data;
            flood(x, y, PS.COLOR_GRAY_DARK, PS.COLOR_GRAY_LIGHT);
        }
    }

    if(PS.color(x, y) == PS.COLOR_GREEN){
        PS.statusInput("Put your taunt here.", function(taunt){
            PS.statusText(taunt);
        });
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
    if(within_field(x, y)){
        for(var i=0; i<10; i += 1){
            for(var j=0; j<10; j += 1){
                PS.color((i + field_x), (j+field_y), p_view[i][j]);
            }
        }
        if(s_select){
            if(check_collide(x, y, s_select.I, s_select.H, 0)){
                if(s_select.I == "vert"){
                    PS.applyRect(x, y, 1, s_select.H, PS.color, PS.COLOR_GRAY_DARK);
                }
                else{
                    PS.applyRect(x, y, s_select.H, 1, PS.color, PS.COLOR_GRAY_DARK);
                }
            }
        }
    }

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
    if(key == 116){
        if(s_select){
            if(s_select.I == "vert"){
                s_select.I = "horiz";
            }
            else{
                s_select.I = "vert"
            }
        }
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

