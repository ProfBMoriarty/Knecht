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

var board_x = 6; //left offset of board
var board_y = 1; //top offset of board
var board_dim = 10; //length of board side

var own_ships =
    [
        {orientation: "hor", pos: {x: 18, y: 1}, color: PS.COLOR_GRAY_DARK, hits:[false, false, false]},
        {orientation: "vert", pos: {x: 18, y: 3}, color: PS.COLOR_GRAY_DARK, hits:[false, false]},
        {orientation: "vert", pos: {x: 18, y: 6}, color: PS.COLOR_GRAY_DARK, hits:[false, false, false, false, false]},
        {orientation: "vert", pos: {x: 20, y: 3}, color: PS.COLOR_GRAY_DARK, hits:[false, false, false]},
        {orientation: "vert", pos: {x: 20, y: 7}, color: PS.COLOR_GRAY_DARK, hits:[false, false, false, false]}
    ];
var opp_ships = //only known to host application, should not be displayed to user
    [
        {orientation: "hor", pos: {x: 18, y: 1}, color: PS.COLOR_GRAY_DARK, hits:[false, false, false]},
        {orientation: "vert", pos: {x: 18, y: 3}, color: PS.COLOR_GRAY_DARK, hits:[false, false]},
        {orientation: "vert", pos: {x: 18, y: 6}, color: PS.COLOR_GRAY_DARK, hits:[false, false, false, false, false]},
        {orientation: "vert", pos: {x: 20, y: 3}, color: PS.COLOR_GRAY_DARK, hits:[false, false, false]},
        {orientation: "vert", pos: {x: 20, y: 7}, color: PS.COLOR_GRAY_DARK, hits:[false, false, false, false]}
    ];

var hitboard = new Array(board_dim);
for(var i = 0; i < board_dim; i++)
{
    hitboard[i] = new Array(board_dim);
}

var selected_piece = null;
var num_placed = 0;

var own_score = 0;
var opp_score = 0;

var player = null;
var step = "unconnected";
var setup_done = false;
var other_setup = false;
var view_own_ships = true;

//changes all beads of color a contiguous with bead x, y to color b
function flood(x, y, color_a, color_b){
    if(PS.color(x, y) == color_a){
        PS.color(x, y, color_b);
        flood(x+1, y, color_a, color_b);
        flood(x-1, y, color_a, color_b);
        flood(x, y+1, color_a, color_b);
        flood(x, y-1, color_a, color_b);

    }
}

//returns true if coordinates are on board
function on_board(x, y){
    if((x >= board_x) && ( x< (board_x + board_dim))){
        if((y >= board_y) && (y < (board_y + board_dim))){
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

//returns true if the selected piece can be placed in coordinate x,y, false if it collides with other piece or board edge
function valid_placement(x, y, piece, cell_num)
{
    if(!cell_num)
    {
        cell_num = 1;
    }
    var hor_step = 0;
    var vert_step = 0;
    if(piece.orientation === "vert")
    {
        vert_step = 1;
    }
    else
    {
        hor_step = 1;
    }
    if(on_board(x, y) && PS.data(x, y) === 0)
    { //if empty coord on board
        if(cell_num < piece.hits.length)
        {
            return valid_placement(x + hor_step, y + vert_step, piece, cell_num + 1); //check the next bead in line
        }
        else return true; //last bead checked, all clear
    }
    else
    {
        PS.statusText("Fails at " + x + "," + y);
        return false;//not a free space
    }
}

function has_border(x, y){
    return PS.border(x, y, PS.CURRENT);
}

function draw_board()
{
    //clear screen
    PS.color(PS.ALL, PS.ALL, PS.COLOR_WHITE);
    //board spaces
    PS.applyRect(board_x, board_y, board_dim, board_dim, PS.color, PS.COLOR_CYAN);
    //board border
    PS.applyRect(board_x - 1, board_y - 1, board_dim + 2, 1, PS.color, PS.COLOR_BLACK);
    PS.applyRect(board_x - 1, board_y - 1, 1, board_dim + 2, PS.color, PS.COLOR_BLACK);
    PS.applyRect(board_x + board_dim, board_y - 1, 1, board_dim + 2, PS.color, PS.COLOR_BLACK);
    PS.applyRect(board_x - 1, board_y + board_dim, board_dim + 2, 1, PS.color, PS.COLOR_BLACK);
    //buttons
    PS.applyRect(1, 1, 3, 1, PS.color, PS.COLOR_RED); //toggle between view of own and enemy ships
    PS.applyRect(1, 3, 3, 1, PS.color, PS.COLOR_GREEN); //makes status line take an input message
    PS.applyRect(1, 5, 3, 1, PS.color, PS.COLOR_BLACK); //logs in. If game doesnt exist, create it, otherwise join it

    if(view_own_ships)
    {
        //ships
        for(var i = 0; i < own_ships.length; i++)
        {
            if(own_ships[i].orientation === "hor")
            {
                PS.applyRect(own_ships[i].pos.x, own_ships[i].pos.y, own_ships[i].hits.length, 1, PS.color, own_ships[i].color);
            }
            else
            {
                PS.applyRect(own_ships[i].pos.x, own_ships[i].pos.y, 1, own_ships[i].hits.length, PS.color, own_ships[i].color);
            }
        }
    }
    else
    {
        for(var i = 0; i < board_dim; i++)
        {
            for(var j = 0; j < board_dim; j++)
            {
                if(hitboard[i][j] === false)
                {
                    PS.color(board_x + i, board_y + j, PS.COLOR_WHITE);
                }
                else if(hitboard[i][j] === true)
                {
                    PS.color(board_x + i, board_y + j, PS.COLOR_ORANGE);
                }
            }
        }
    }
}

function update_data()
{
    PS.data(PS.ALL, PS.ALL, 0);
    for(var i = 0; i < own_ships.length; i++)
    {
        if(own_ships[i].orientation === "hor")
        {
            PS.applyRect(own_ships[i].pos.x, own_ships[i].pos.y, own_ships[i].hits.length, 1, PS.data, {index:i});
        }
        else
        {
            PS.applyRect(own_ships[i].pos.x, own_ships[i].pos.y, 1, own_ships[i].hits.length, PS.data, {index:i});
        }
    }
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

	K.setAddress("http://localhost:8080");
    K.setApplication("battleship");
    K.setErrorCallback(function(fn, err)
    {
        PS.statusText("Error processing " + fn + ": " + err);
    });

    PS.gridSize( 22, 12 );
    //set up borders
    PS.border(PS.ALL, PS.ALL, 0);
    PS.applyRect(board_x, board_y, board_dim, board_dim, PS.border, PS.DEFAULT);

    //draw initial board position
    update_data();
    draw_board();

    PS.statusText("Click to register and start/join game");
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

    if(player === null)
    {
        K.register("p1", "p", function(r)
        {
           if(r.error)
           {//if p1 already registered, register p2 and join p1's game
               player = "p2";
               K.register("p2", "p", function(r)
               {
                   K.submitInput("g", "JOIN", function(r)
                   {
                       step = "wait";
                       K.listenUpdates("g", processUpdates);
                       PS.statusText("Player 2 (Member) Registered");
                   });
               });
           }
            else
           { //otherwise start game
               player = "p1";
               K.startGroup("g", "p", function(r)
               {
                   step = "wait";
                   K.listenInputs("g", processInputs);
                   PS.statusText("Player 1 (Host) Registered");
               });
           }
        });
    }
    else if(step === "setup")
    {
        if(selected_piece === null && data.index !== undefined && own_ships[data.index].color === PS.COLOR_GRAY_DARK)
        {//if unplaced ship click and no ship selected
            selected_piece = data.index;
        }
        else if(selected_piece !== null && valid_placement(x, y, own_ships[selected_piece]))
        {//if unplaced ship selected and current location is a valid spot to put it
            own_ships[selected_piece].color = PS.COLOR_GRAY_LIGHT; //change color to indicate ship has been placed
            selected_piece = null; //unselect ship
            if(++num_placed === 5)
            {
                if(player === "p1")
                {
                    K.submitUpdates("g", ["p1_ships", "p1_ready"], [own_ships, true], function(r){}, [false, true]);
                    if(other_setup)
                    {
                        step = "move";
                        PS.statusText("It is your turn");
                        view_own_ships = false;
                        draw_board();
                    }
                    else
                    {
                        step = "wait";
                        PS.statusText("Waiting for opponent to finish setting up");
                    }
                }
                else
                {
                    K.submitInput("g", {setup: own_ships}, function(r){});
                    step = "wait";
                    if(other_setup)
                    {
                        PS.statusText("Opponent's turn");
                        view_own_ships = false;
                        draw_board();
                    }
                    else
                    {
                        PS.statusText("Waiting for opponent to finish setting up");
                    }
                }
                setup_done = true;
            }
            update_data();
            draw_board();
        }
    }
    else if (step === "move")
    {
        if(on_board(x, y) && hitboard[x - board_x][y - board_y] === undefined)
        {
            PS.statusText("Attack position chosen");
            if(player === "p1")
            {
                var hit = false;
                for(var i = 0; i < opp_ships.length; i++)
                {
                    if(x === opp_ships[i].pos.x)
                    {
                        for(var j = 0; j < opp_ships[i].hits.length; j++)
                        {
                            if(y === opp_ships[i].pos.y + j)
                            {
                                opp_ships[i].hits[j] = true;
                                hit = true;
                            }
                        }
                    }
                    else if(y === opp_ships[i].pos.y)
                    {
                        for(var j = 0; j < opp_ships[i].hits.length; j++)
                        {
                            if(x === opp_ships[i].pos.x + j)
                            {
                                opp_ships[i].hits[j] = true;
                                hit = true;
                            }
                        }
                    }
                }
                hitboard[x - board_x][y - board_y] = hit;
                K.submitUpdates("g", "host move", {x: x, y: y, hit: hit}, function(r){}, true, "p2");
                step = "wait";
                PS.statusText("Opponent's turn");
            }
            else
            {
                K.submitInput("g", {x: x, y: y}, function(){});
                step = "wait";
                PS.statusText ("validating move");
            }
            draw_board();
        }
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
    if(selected_piece !== null)
    {
        own_ships[selected_piece].pos = {x: x, y: y};
        draw_board();
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
    if(key == 116){ //rotate with t
        if(selected_piece !== null){
            if(own_ships[selected_piece].orientation == "vert"){
                own_ships[selected_piece].orientation = "hor";
            }
            else{
                own_ships[selected_piece].orientation = "vert";
            }
            draw_board();
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

