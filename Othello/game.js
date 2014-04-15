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

var made_selection = false;
var is_turn = false;
var p_color = PS.COLOR_CYAN;

// All of the functions below MUST exist, or the engine will complain!

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

    K.setApplication("Othello");
    K.setAddress("http://localhost:8088");

    K.register("p2", "p2", function(result, time){
        if(result.error){
            K.register("p1", "p1", function(r, time){
                if(r.error){
                    PS.statusText("Cannot connect to server");
                }
                else{
                    K.startGroup("othello", "othello", function(res){
                        if(res.error){
                            PS.statusText("Could not start group");
                        }
                    });
                    K.addMember("othello", "p2", function(response){
                        if(response.error){
                            PS.statusText("Could not add member");
                        }
                    });
                    K.grantPermission("othello", "p2", "move", function(r){
                        if(r.error){
                            PS.statusText("Could not grant permission");
                        }
                    });

                    p_color = PS.COLOR_BLACK;
                    is_turn = true;
                }
            })
        }
        else{
            p_color = PS.COLOR_WHITE;
            is_turn = false;
        }

        if(p_color !== PS.COLOR_CYAN){
            if(p_color == PS.COLOR_BLACK){
                PS.timerStart(60, myTimer);
            }
        }
    });

	PS.gridSize( 8, 11 );

    PS.statusText("Othello, Bitch");

    PS.applyRect(0, 0, 8, 8, PS.color, PS.COLOR_GREEN);
    PS.applyRect(0, 0, 8, 8, PS.glyphColor, PS.COLOR_CYAN);

    PS.applyRect(0, 8, 8, 1, PS.color, PS.COLOR_BLACK);
    PS.applyRect(0, 8, 8, 1, PS.glyphColor, PS.COLOR_WHITE);
    put_text(8, "Score:");

    PS.applyRect(0, 9, 4, 1, PS.color, PS.COLOR_RED);
    PS.applyRect(0, 9, 4, 1, PS.glyphColor, PS.COLOR_WHITE);
    put_text(9, "Pass");

    PS.applyRect(0, 10, 5, 1, PS.color, PS.COLOR_CYAN);
    put_text(10, "Taunt");

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

    if(in_bounds(x, y)){
        if(is_turn && (PS.glyph(x, y) == PS.DEFAULT)){
            find_color(x-1, y-1, p_color, "ul");
            find_color(x+1, y-1, p_color, "ur");
            find_color(x-1, y+1, p_color, "dl");
            find_color(x+1, y+1, p_color, "dr");
            find_color(x, y-1, p_color, "u");
            find_color(x, y+1, p_color, "d");
            find_color(x-1, y, p_color, "l");
            find_color(x+1, y, p_color, "r");

            if(made_selection){
                PS.glyphColor(x, y, p_color);
                PS.glyph(x, y, "O");
                var to_send = {"X": x, "Y": y};
                if(p_color == PS.COLOR_BLACK){

                    K.submitUpdate("othello", "move", to_send, function(){});
                }
                else{
                    K.submitInput("othello", to_send, function(){});
                }
                is_turn = false;
                made_selection = false;
                updateScore();
                checkEnding();
            }
        }
    }
    else{
        if(PS.color(x, y) == PS.COLOR_RED){
            if(is_turn){
                var to_send = {"Pass": true};
                if(p_color = PS.COLOR_BLACK){
                    K.submitUpdate("othello", "move", to_send, function(){});
                }
                else{
                    K.submitInput("othello", to_send, function(){});
                }
            }
            is_turn = false;
        }
        if(PS.color(x, y) == PS.COLOR_CYAN){
            PS.statusInput("", function(text){
                var to_send = {"taunt": text};
                if(p_color = PS.COLOR_BLACK){
                    K.submitUpdate("othello", "move", to_send, function(){});
                }
                else{
                    K.submitInput("othello", to_send, function(){});
                }
            });
        }
    }

    PS.statusText("Othello, Bitch");
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

	// Add code here for when a key is pressed
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

function put_text(y, text_string){
    for(var i = 0; i < text_string.length; i += 1){
        PS.glyph(i, y, text_string[i]);
    }
}

function in_bounds(x, y){
    if((x < 0) || (x > 7)){
        return false;
    }
    if((y < 0) || (y > 7)){
        return false;
    }

    return true;
}

function find_color(x, y, color, dir){
    var new_x = x;
    var new_y = y;
    if(dir == "ul"){
        new_x -= 1;
        new_y -= 1;
    }
    if(dir == "ur"){
        new_x += 1;
        new_y -= 1;
    }
    if(dir == "dl"){
        new_x -= 1;
        new_y += 1;
    }
    if(dir == "dr"){
        new_x += 1;
        new_y += 1;
    }
    if(dir == "u"){
        new_y -= 1;
    }
    if(dir == "d"){
        new_y += 1;
    }
    if(dir == "l"){
        new_x -= 1;
    }
    if(dir == "r"){
        new_x += 1;
    }
    if(in_bounds(x, y)){
        if(PS.glyphColor(x, y) == PS.COLOR_CYAN){
            return false;
        }
        if(PS.glyphColor(x, y) == color){
            made_selection = true;
            return true;
        }
        else{
            if(find_color(new_x, new_y, color, dir)){
                PS.glyphColor(x, y, color);
                return true;
            }
            else{
                return false;
            }
        }
    }
    else{
        return false;
    }
}

function place_piece(x, y, color){
    //for when placing an opponent's piece
    find_color(x-1, y-1, color, "ul");
    find_color(x+1, y-1, color, "ur");
    find_color(x-1, y+1, color, "dl");
    find_color(x+1, y+1, color, "dr");
    find_color(x, y-1, color, "u");
    find_color(x, y+1, color, "d");
    find_color(x-1, y, color, "l");
    find_color(x+1, y, color, "r");

    PS.glyph(x, y, "O");
    PS.glyphColor(x, y, color);

    made_selection = false;
}

function myTimer(){
    if(p_color == PS.COLOR_BLACK){
        K.listenInputs("othello", function(result){
            var j;
            for(var i; i < result.body.input.length; i += 1){
                j = result.body.input[i];
                if(j.taunt){
                    PS.statusText(j.taunt);
                }
                else if(j.pass){
                    PS.statusText("Your opponent passes");
                    is_turn = true;
                }
                else{
                    place_piece(j.X, j.Y, PS.COLOR_WHITE);
                    is_turn = true;
                    updateScore();
                    checkEnding();
                }
            }
        });
    }
    else{
        K.listenUpdates("othello", function(result){
            var j;
            for(var i; i < result.body.input.length; i += 1){
                j = result.body.input[i];
                if(j.taunt){
                    PS.statusText(j.taunt);
                }
                else if(j.pass){
                    PS.statusText("Your opponent passes");
                    is_turn = true;
                }
                else{
                    place_piece(j.X, j.Y, PS.COLOR_WHITE);
                    is_turn = true;
                    updateScore();
                    checkEnding();
                }
            }
        });
    }
}

function updateScore(){
    var score = 0;
    for(var i = 0; i < 8; i += 1){
        for(var j = 0; j < 8; j += 1){
            if(PS.glyphColor(i, j) == p_color){
                score += 1;
            }
        }
    }

    PS.glyph(6, 8, "" + Math.floor(score/10) + "");
    PS.glyph(7, 8, "" + (score%10) + "");

    return score;
}

function checkEnding(){
    var is_done = true;
    for(var i = 0; i < 8; i += 1){
        for(var j = 0; j < 8; j += 1){
            if(PS.glyphColor(i, j) == PS.COLOR_CYAN){
                is_done = false;
            }
        }
    }

    if(is_done){
        if(updateScore() > 32){
            PS.statusText("You Win");
        }
        else if(updateScore() < 32){
            PS.statusText("You Lose");
        }
        else{
            PS.statusText("You Tied");
        }

        is_turn = false;
    }
}

