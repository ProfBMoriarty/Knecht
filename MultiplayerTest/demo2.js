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

var user;
var group;
var blue_pos = {x:0, y:7, active: false};
var red_pos = {x:7, y:0, active: false};
var green_pos = {x:7, y:7, active: false};

// PS.init( system, options )
// Initializes the game
// This function should normally begin with a call to PS.gridSize( x, y )
// where x and y are the desired initial dimensions of the grid
// [system] = an object containing engine and platform information; see documentation for details
// [options] = an object with optional parameters; see documentation for details

PS.init = function( system, options ) {
	"use strict";

	// Use PS.gridSize( x, y ) to set the grid to
	// the initial dimensions you want (32 x 32 maximum)
	// Do this FIRST to avoid problems!
	// Otherwise you will get the default 8x8 grid

    K.setAddress("http://localhost:8080");
    K.setApplication("multi_test");

	PS.gridSize( 8, 8 );
    PS.color(0, 0, PS.COLOR_BLUE); //player one color
    PS.color(0, 1, PS.COLOR_RED); //player two color
    PS.color(0, 2, PS.COLOR_GREEN); //player three color

    K.setErrorCallback(function(fn, err)
    {
       PS.statusText("Error processing " + fn + ": " + err);
    });

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
    var color = PS.color(x, y);
    if(!user)
    {
        if(color === PS.COLOR_BLUE)
        {
            user = 'player 1';
        }
        else if(color === PS.COLOR_RED)
        {
            user = 'player 2';
        }
        else if(color === PS.COLOR_GREEN)
        {
            user = 'player 3';
        }
        K.register(user, user + "_pass", function(res)
        {
            if(!res.error) PS.statusText(user + " registered successfully");
            else user = '';
        });
    }
    else if(!group)
    {
        if(color === PS.COLOR_BLUE)
        {
            group = 'player 1';
        }
        else if(color === PS.COLOR_RED)
        {
            group = 'player 2';
        }
        else if(color === PS.COLOR_GREEN)
        {
            group = 'player 3';
        }
        if(user === group)
        {
            K.startGroup(group + "_group", group + "_group_pass", function (res)
            {
                if(!res.error)
                {
                    group += "_group";
                    PS.statusText(group + " registered successfully");
                    if(user === 'player 1') blue_pos.active = true;
                    if(user === 'player 2') red_pos.active = true;
                    if(user === 'player 3') green_pos.active = true;
                    K.listenInputs(group, processInputs);
                }
                else group = '';
            });
        }
        else K.submitInput(group + "_group", "JOIN", function(res)
        {
            if(!res.error)
            {
                group += "_group";
                PS.statusText(group + " join request sent successfully");
                K.listenUpdates(group, processUpdates);
            }
            else group = '';
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
    if(user && group)
    {
        if(key == PS.KEY_ARROW_LEFT)
        {
            PS.debug("left");
            K.submitInput(group, "LEFT", function(){});
        }
        else if(key == PS.KEY_ARROW_RIGHT)
        {
            PS.debug("right");
            K.submitInput(group, "RIGHT", function(){});
        }
        else if(key == PS.KEY_ARROW_UP)
        {
            PS.debug("up");
            K.submitInput(group, "UP", function(){});
        }
        else if(key == PS.KEY_ARROW_DOWN)
        {
            PS.debug("down");
            K.submitInput(group, "DOWN", function(){});
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

function processInputs(input_response)
{
    if(input_response.inputs)
    {
        for(var i = 0; i < input_response.inputs.length; i++)
        {
            if(input_response.inputs[i].input === "JOIN")
            {
                var can_join = false;
                if(input_response.inputs[i].user === "player 1" && PS.color(blue_pos.x, blue_pos.y) === PS.COLOR_WHITE)
                {
                    can_join = true;
                    blue_pos.active = true;
                    K.submitUpdates(group, "blue_pos", blue_pos, submitUpdateCallback, true, 'player 1');
                }
                else if(input_response.inputs[i].user === "player 2" && PS.color(red_pos.x, red_pos.y) === PS.COLOR_WHITE)
                {
                    can_join = true;
                    red_pos.active = true;
                    K.submitUpdates(group, "red_pos", red_pos, submitUpdateCallback, true, 'player 2');
                }
                else if(input_response.inputs[i].user === "player 3" && PS.color(green_pos.x, green_pos.y) === PS.COLOR_WHITE)
                {
                    can_join = true;
                    green_pos.active = true;
                    K.submitUpdates(group, "green_pos", green_pos, submitUpdateCallback, true, 'player 3');
                }
                if(can_join)
                {
                    K.addMember(group, input_response.inputs[i].user, function()
                    {
                        K.listMembersOfGroup(group, function(r)
                        {
                            PS.statusText(JSON.stringify(r.members) + " are in");
                            drawPositions();
                        });
                    });
                }
            }
            else
            {
                var x_offset = 0;
                var y_offset = 0;
                if(input_response.inputs[i].input === "LEFT")
                {
                    x_offset = -1;
                }
                else if(input_response.inputs[i].input === "RIGHT")
                {
                    x_offset = 1;
                }
                else if(input_response.inputs[i].input === "UP")
                {
                    y_offset = -1;
                }
                else if(input_response.inputs[i].input === "DOWN")
                {
                    y_offset = 1;
                }
                if(input_response.inputs[i].user === "player 1"
                    && PS.color(blue_pos.x + x_offset, blue_pos.y + y_offset) === PS.COLOR_WHITE)
                {
                    blue_pos.x += x_offset;
                    blue_pos.y += y_offset;
                    drawPositions();
                    K.submitUpdates(group, "blue_pos", blue_pos, submitUpdateCallback, true, 'player 1');
                }
                else if(input_response.inputs[i].user === "player 2"
                    && PS.color(red_pos.x + x_offset, red_pos.y + y_offset) === PS.COLOR_WHITE)
                {
                    red_pos.x += x_offset;
                    red_pos.y += y_offset;
                    drawPositions();
                    K.submitUpdates(group, "red_pos", red_pos, submitUpdateCallback, true, 'player 2');
                }
                else if(input_response.inputs[i].user === "player 3"
                    && PS.color(green_pos.x + x_offset, green_pos.y + y_offset) === PS.COLOR_WHITE)
                {
                    green_pos.x += x_offset;
                    green_pos.y += y_offset;
                    drawPositions();
                    K.submitUpdates(group, "green_pos", green_pos, submitUpdateCallback, true, 'player 3');
                }
            }
        }
    }
}

function processUpdates(res)
{
    PS.statusText(JSON.stringify(res));
    for(var i = 0; i < res.updates.length; i++)
    {
        if(res.updates[i] === 'blue_pos') blue_pos = res.data.blue_pos;
        if(res.updates[i] === 'red_pos') red_pos = res.data.red_pos;
        if(res.updates[i] === 'green_pos') green_pos = res.data.green_pos;
    }
    drawPositions();
}

function drawPositions()
{
    PS.color(PS.ALL, PS.ALL, PS.COLOR_WHITE);
    if(blue_pos.active) PS.color(blue_pos.x, blue_pos.y, PS.COLOR_BLUE);
    if(red_pos.active) PS.color(red_pos.x, red_pos.y, PS.COLOR_RED);
    if(green_pos.active) PS.color(green_pos.x, green_pos.y, PS.COLOR_GREEN);
}

function submitUpdateCallback(response)
{
    if(response.error) PS.statusText(response.error);
    else PS.statusText("Updates submitted");
}
