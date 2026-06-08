var state = "IDLE";
var state_last = "";
var graph = [ 'profile', 'live'];
var points = [];
var profiles = [];
var time_mode = 0;
var selected_profile = 0;
var selected_profile_name = 'cone-05-long-bisque.json';
var temp_scale = "c";
var time_scale_slope = "s";
var time_scale_profile = "h";
var time_scale_long = "Seconds";
var temp_scale_display = "C";
var kwh_rate = 0.26;
var currency_type = "EUR";

var current_zone = 0;
var available_zones = [
    {id: 0, name: "Zone 1 (Top)", color: "#e74c3c"},
    {id: 1, name: "Zone 2 (Middle)", color: "#f39c12"},
    {id: 2, name: "Zone 3 (Bottom)", color: "#3498db"}
];

// Track current temperature for each zone
var zone_temperatures = [0, 0, 0];
// Track heat state (relay on/off) for each zone
var zone_heat_states = [0, 0, 0];

var protocol = 'ws:';
if (window.location.protocol == 'https:') {
    protocol = 'wss:';
}
var host = "" + protocol + "//" + window.location.hostname + ":" + window.location.port;
var ws_config = new WebSocket(host+"/config");
var ws_storage = new WebSocket(host+"/storage");

// Arrays to hold websockets for all zones
var ws_status = [];
var ws_control = [];

function zoneQuery(zone_id) {
    return "?zone=" + encodeURIComponent(zone_id);
}

function connectZoneSockets() {
    // Close existing connections
    for (var i = 0; i < ws_status.length; i++) {
        try { if (ws_status[i]) ws_status[i].close(); } catch (e) {}
        try { if (ws_control[i]) ws_control[i].close(); } catch (e) {}
    }

    ws_status = [];
    ws_control = [];

    // Connect to all zones
    for (var i = 0; i < available_zones.length; i++) {
        ws_status[i] = new WebSocket(host + "/status" + zoneQuery(i));
        ws_control[i] = new WebSocket(host + "/control" + zoneQuery(i));
        bindStatusSocket(i);
        bindControlSocket(i);
        // Reset live graph data for each zone
        if (graph['live_zone' + i]) {
            graph['live_zone' + i].data = [];
        }
    }

    updateGraphPlot();
}

function bindStatusSocket(zone_id) {
    ws_status[zone_id].onopen = function()
    {
        console.log("Status Socket for Zone " + zone_id + " has been opened");
    };

    ws_status[zone_id].onclose = function()
    {
        $.bootstrapGrowl("<span class=\"glyphicon glyphicon-exclamation-sign\"></span> <b>ERROR:</b><br/>Status Websocket for Zone " + zone_id + " not available", {
        ele: 'body',
        type: 'error',
        offset: {from: 'top', amount: 250},
        align: 'center',
        width: 385,
        delay: 5000,
        allow_dismiss: true,
        stackup_spacing: 10
      });
    };

    ws_status[zone_id].onmessage = function(e)
    {
        x = JSON.parse(e.data);
        var zone = zone_id; // Capture zone_id in closure
        
        if (x.type == "backlog")
        {
            if (x.profile && zone === 0) // Only process profile from first zone
            {
                selected_profile_name = x.profile.name;
                $.each(profiles,  function(i,v) {
                    if(v.name == x.profile.name) {
                        updateProfile(i);
                        $('#e2').select2('val', i);
                    }
                });
            }

            $.each(x.log, function(i,v) {
                graph['live_zone' + zone].data.push([v.runtime, v.temperature]);
                // Track the last temperature and heat state from backlog
                if (v.temperature) {
                    zone_temperatures[zone] = v.temperature;
                }
                if (v.heat !== undefined) {
                    zone_heat_states[zone] = v.heat;
                }
            });
            
            // Update labels with temperatures from backlog
            updateZoneLabels();
            updateGraphPlot();
        }

        if(state!="EDIT")
        {
            // Only update state from zone 0 to avoid conflicts
            if (zone === 0) {
                state = x.state;
                if (state!=state_last)
                {
                    if(state_last == "RUNNING" && state != "PAUSED" )
                    {
                        console.log(state);
                        $('#target_temp').html('---');
                        updateProgress(0);
                        $.bootstrapGrowl("<span class=\"glyphicon glyphicon-exclamation-sign\"></span> <b>Run completed</b>", {
                        ele: 'body',
                        type: 'success',
                        offset: {from: 'top', amount: 250},
                        align: 'center',
                        width: 385,
                        delay: 0,
                        allow_dismiss: true,
                        stackup_spacing: 10
                        });
                    }
                }

                if(state=="RUNNING")
                {
                    $("#nav_start").hide();
                    $("#nav_stop").show();
                    // Disable profile selector during run
                    $('#e2').prop('disabled', true);

                    left = parseInt(x.totaltime-x.runtime);
                    eta = new Date(left * 1000).toISOString().substr(11, 8);

                    updateProgress(parseFloat(x.runtime)/parseFloat(x.totaltime)*100);
                    $('#state').html('<span class="glyphicon glyphicon-time" style="font-size: 22px; font-weight: normal"></span><span style="font-family: Digi; font-size: 40px;">' + eta + '</span>');
                    $('#target_temp').html(parseInt(x.target));
                    $('#cost').html(x.currency_type + parseFloat(x.cost).toFixed(2));
                }
                else
                {
                    $("#nav_start").show();
                    $("#nav_stop").hide();
                    // Re-enable profile selector when not running
                    $('#e2').prop('disabled', false);
                    $('#state').html('<p class="ds-text">'+state+'</p>');
                }

                if (typeof x.pidstats !== 'undefined') {
                    $('#heat').html('<div class="bar" style="height:'+x.pidstats.out*70+'%;"></div>')
                }
                if (x.cool > 0.5) { $('#cool').addClass("ds-led-cool-active"); } else { $('#cool').removeClass("ds-led-cool-active"); }
                if (x.air > 0.5) { $('#air').addClass("ds-led-air-active"); } else { $('#air').removeClass("ds-led-air-active"); }
                if (x.temperature > hazardTemp()) { $('#hazard').addClass("ds-led-hazard-active"); } else { $('#hazard').removeClass("ds-led-hazard-active"); }
                if ((x.door == "OPEN") || (x.door == "UNKNOWN")) { $('#door').addClass("ds-led-door-open"); } else { $('#door').removeClass("ds-led-door-open"); }

                state_last = state;
            }

            // Add temperature data point for this zone
            if (state == "RUNNING") {
                graph['live_zone' + zone].data.push([x.runtime, x.temperature]);
                updateGraphPlot();
            }

            // Store temperature and heat state for this zone
            zone_temperatures[zone] = x.temperature;
            zone_heat_states[zone] = x.heat || 0;

            // Calculate and display average temperature from all zones
            var total_temp = 0;
            var temp_count = 0;

            for (var i = 0; i < available_zones.length; i++) {
                if (zone_temperatures[i] !== undefined && zone_temperatures[i] > 0) {
                    total_temp += zone_temperatures[i];
                    temp_count++;
                }
            }

            if (temp_count > 0) {
                var avg_temp = total_temp / temp_count;
                $('#act_temp').html(parseInt(avg_temp));
            }

            // Update graph labels to show current temperatures
            updateZoneLabels();
            updateGraphPlot();

            // For heat rate, just use x.heat_rate from zone 0 for now
            if (zone === 0) {
                heat_rate = parseInt(x.heat_rate);
                if (heat_rate > 9999) { heat_rate = 9999; }
                if (heat_rate < -9999) { heat_rate = -9999; }
                $('#heat_rate').html(heat_rate);
            }
        }
    };
}

function bindControlSocket(zone_id) {
    ws_control[zone_id].onopen = function()
    {
        console.log("Control socket for Zone " + zone_id + " has been opened");
    };

    ws_control[zone_id].onmessage = function(e)
    {
        //Data from Simulation
        console.log ("control socket message from zone " + zone_id);
        console.log (e.data);
        x = JSON.parse(e.data);
        var zone = zone_id; // Capture in closure
        graph['live_zone' + zone].data.push([x.runtime, x.temperature]);
        
        // Update temperature and heat state tracking
        if (x.temperature) {
            zone_temperatures[zone] = x.temperature;
        }
        if (x.heat !== undefined) {
            zone_heat_states[zone] = x.heat;
        }
        updateZoneLabels();
        
        updateGraphPlot();
    }
}

function renderZoneSelector() {
    // Zone selector is now hidden since all zones work together
    var select = $('#zone_select');
    if (select.length) {
        select.hide();
    }
}


if(window.webkitRequestAnimationFrame) window.requestAnimationFrame = window.webkitRequestAnimationFrame;

graph.profile =
{
    label: "Profile",
    data: [],
    points: { show: false },
    color: "#75890c",
    draggable: false
};

// Create separate live data series for each zone
graph.live_zone0 =
{
    label: "Zone 1 (Top)",
    data: [],
    points: { show: false },
    color: "#e74c3c",
    draggable: false
};

graph.live_zone1 =
{
    label: "Zone 2 (Middle)",
    data: [],
    points: { show: false },
    color: "#f39c12",
    draggable: false
};

graph.live_zone2 =
{
    label: "Zone 3 (Bottom)",
    data: [],
    points: { show: false },
    color: "#3498db",
    draggable: false
};

// Helper function to update the graph with all series
function updateGraphPlot() {
    graph.plot = $.plot("#graph_container", [ 
        graph.profile, 
        graph.live_zone0, 
        graph.live_zone1, 
        graph.live_zone2 
    ], getOptions());
}

// Helper function to update zone labels with current temperatures
function updateZoneLabels() {
    for (var i = 0; i < available_zones.length; i++) {
        var label = available_zones[i].name;
        var heatIcon = '';
        
        // Add fire or snowflake emoji based on heat state
        if (zone_heat_states[i] > 0.5) {
            heatIcon = '🔥 ';
        } else {
            heatIcon = '❄️ ';
        }
        
        if (zone_temperatures[i] && zone_temperatures[i] > 0) {
            graph['live_zone' + i].label = heatIcon + label + ': ' + parseInt(zone_temperatures[i]) + '°' + temp_scale_display;
        } else {
            graph['live_zone' + i].label = heatIcon + label;
        }
    }
}


function updateProfile(id)
{
    selected_profile = id;
    selected_profile_name = profiles[id].name;
    var job_seconds = profiles[id].data.length === 0 ? 0 : parseInt(profiles[id].data[profiles[id].data.length-1][0]);
    var kwh = (3850*job_seconds/3600/1000).toFixed(2);
    var cost =  (kwh*kwh_rate).toFixed(2);
    var job_time = new Date(job_seconds * 1000).toISOString().substr(11, 8);
    $('#sel_prof').html(profiles[id].name);
    $('#sel_prof_eta').html(job_time);
    $('#sel_prof_cost').html(kwh + ' kWh ('+ currency_type +': '+ cost +')');
    graph.profile.data = profiles[id].data;
    updateGraphPlot();
}

function deleteProfile()
{
    var profile = { "type": "profile", "data": "", "name": selected_profile_name };
    var delete_struct = { "cmd": "DELETE", "profile": profile };

    var delete_cmd = JSON.stringify(delete_struct);
    console.log("Delete profile:" + selected_profile_name);

    ws_storage.send(delete_cmd);

    ws_storage.send('GET');
    selected_profile_name = profiles[0].name;

    state="IDLE";
    $('#edit').hide();
    $('#profile_selector').show();
    $('#btn_controls').show();
    $('#status').slideDown();
    $('#profile_table').slideUp();
    $('#e2').select2('val', 0);
    graph.profile.points.show = false;
    graph.profile.draggable = false;
    updateGraphPlot();
}


function updateProgress(percentage)
{
    if(state=="RUNNING")
    {
        if(percentage > 100) percentage = 100;
        $('#progressBar').css('width', percentage+'%');
        if(percentage>5) $('#progressBar').html(parseInt(percentage)+'%');
    }
    else
    {
        $('#progressBar').css('width', 0+'%');
        $('#progressBar').html('');
    }
}

function updateProfileTable()
{
    var dps = 0;
    var slope = "";
    var color = "";

    var html = '<h3>Schedule Points</h3><div class="table-responsive" style="scroll: none"><table class="table table-striped">';
        html += '<tr><th style="width: 50px">#</th><th>Target Time in ' + time_scale_long+ '</th><th>Target Temperature in °'+temp_scale_display+'</th><th>Slope in &deg;'+temp_scale_display+'/'+time_scale_slope+'</th><th></th></tr>';

    for(var i=0; i<graph.profile.data.length;i++)
    {

        if (i>=1) dps =  ((graph.profile.data[i][1]-graph.profile.data[i-1][1])/(graph.profile.data[i][0]-graph.profile.data[i-1][0]) * 10) / 10;
        if (dps  > 0) { slope = "up";     color="rgba(206, 5, 5, 1)"; } else
        if (dps  < 0) { slope = "down";   color="rgba(23, 108, 204, 1)"; dps *= -1; } else
        if (dps == 0) { slope = "right";  color="grey"; }

        html += '<tr><td><h4>' + (i+1) + '</h4></td>';
        html += '<td><input type="text" class="form-control" id="profiletable-0-'+i+'" value="'+ timeProfileFormatter(graph.profile.data[i][0],true) + '" style="width: 60px" /></td>';
        html += '<td><input type="text" class="form-control" id="profiletable-1-'+i+'" value="'+ graph.profile.data[i][1] + '" style="width: 60px" /></td>';
        html += '<td><div class="input-group"><span class="glyphicon glyphicon-circle-arrow-' + slope + ' input-group-addon ds-trend" style="background: '+color+'"></span><input type="text" class="form-control ds-input" readonly value="' + formatDPS(dps) + '" style="width: 100px" /></div></td>';
        html += '<td>&nbsp;</td></tr>';
    }

    html += '</table></div>';

    $('#profile_table').html(html);

    //Link table to graph
    $(".form-control").change(function(e)
        {
            var id = $(this)[0].id; //e.currentTarget.attributes.id
            var value = parseInt($(this)[0].value);
            var fields = id.split("-");
            var col = parseInt(fields[1]);
            var row = parseInt(fields[2]);

            if (graph.profile.data.length > 0) {
            if (col == 0) {
                graph.profile.data[row][col] = timeProfileFormatter(value,false);
            }
            else {
                graph.profile.data[row][col] = value;
            }

            updateGraphPlot();
            }
            updateProfileTable();

        });
}

function timeProfileFormatter(val, down) {
    var rval = val
    switch(time_scale_profile){
        case "m":
            if (down) {rval = val / 60;} else {rval = val * 60;}
            break;
        case "h":
            if (down) {rval = val / 3600;} else {rval = val * 3600;}
            break;
    }
    return Math.round(rval);
}

function formatDPS(val) {
    var tval = val;
    if (time_scale_slope == "m") {
        tval = val * 60;
    }
    if (time_scale_slope == "h") {
        tval = (val * 60) * 60;
    }
    return Math.round(tval);
}

function hazardTemp(){

    if (temp_scale == "f") {
        return (1500 * 9 / 5) + 32
    }
    else {
        return 1500
    }
}

function timeTickFormatter(val,axis)
{
// hours
if(axis.max>3600) {
  //var hours = Math.floor(val / (3600));
  //return hours;
  return Math.floor(val/3600);
  }

// minutes
if(axis.max<=3600) {
  return Math.floor(val/60);
  }

// seconds
if(axis.max<=60) {
  return val;
  }
}

function runTask()
{
    // Send RUN command to all zones
    for (var i = 0; i < available_zones.length; i++) {
        var cmd = {
            "cmd": "RUN",
            "zone": i,
            "profile": profiles[selected_profile]
        };
        // Clear live data for this zone
        graph['live_zone' + i].data = [];
        ws_control[i].send(JSON.stringify(cmd));
    }

    updateGraphPlot();
}

function runTaskSimulation()
{
    // Send SIMULATE command to all zones
    for (var i = 0; i < available_zones.length; i++) {
        var cmd = {
            "cmd": "SIMULATE",
            "zone": i,
            "profile": profiles[selected_profile]
        };
        // Clear live data for this zone
        graph['live_zone' + i].data = [];
        ws_control[i].send(JSON.stringify(cmd));
    }

    updateGraphPlot();
}


function abortTask()
{
    // Send STOP command to all zones
    for (var i = 0; i < available_zones.length; i++) {
        var cmd = {"cmd": "STOP", "zone": i};
        ws_control[i].send(JSON.stringify(cmd));
    }
}

function enterNewMode()
{
    state="EDIT"
    $('#status').slideUp();
    $('#edit').show();
    $('#profile_selector').hide();
    $('#btn_controls').hide();
    $('#form_profile_name').attr('value', '');
    $('#form_profile_name').attr('placeholder', 'Please enter a name');
    graph.profile.points.show = true;
    graph.profile.draggable = true;
    graph.profile.data = [];
    updateGraphPlot();
    updateProfileTable();
}

function enterEditMode()
{
    state="EDIT"
    $('#status').slideUp();
    $('#edit').show();
    $('#profile_selector').hide();
    $('#btn_controls').hide();
    console.log(profiles);
    $('#form_profile_name').val(profiles[selected_profile].name);
    graph.profile.points.show = true;
    graph.profile.draggable = true;
    updateGraphPlot();
    updateProfileTable();
    toggleTable();
}

function leaveEditMode()
{
    selected_profile_name = $('#form_profile_name').val();
    ws_storage.send('GET');
    state="IDLE";
    $('#edit').hide();
    $('#profile_selector').show();
    $('#btn_controls').show();
    $('#status').slideDown();
    $('#profile_table').slideUp();
    graph.profile.points.show = false;
    graph.profile.draggable = false;
    updateGraphPlot();
}

function newPoint()
{
    if(graph.profile.data.length > 0)
    {
        var pointx = parseInt(graph.profile.data[graph.profile.data.length-1][0])+15;
    }
    else
    {
        var pointx = 0;
    }
    graph.profile.data.push([pointx, Math.floor((Math.random()*230)+25)]);
    updateGraphPlot();
    updateProfileTable();
}

function delPoint()
{
    graph.profile.data.splice(-1,1)
    updateGraphPlot();
    updateProfileTable();
}

function toggleTable()
{
    if($('#profile_table').css('display') == 'none')
    {
        $('#profile_table').slideDown();
    }
    else
    {
        $('#profile_table').slideUp();
    }
}

function saveProfile()
{
    name = $('#form_profile_name').val();
    var rawdata = graph.plot.getData()[0].data
    var data = [];
    var last = -1;

    for(var i=0; i<rawdata.length;i++)
    {
        if(rawdata[i][0] > last)
        {
          data.push([rawdata[i][0], rawdata[i][1]]);
        }
        else
        {
          $.bootstrapGrowl("<span class=\"glyphicon glyphicon-exclamation-sign\"></span> <b>ERROR 88:</b><br/>An oven is not a time-machine", {
            ele: 'body', // which element to append to
            type: 'alert', // (null, 'info', 'error', 'success')
            offset: {from: 'top', amount: 250}, // 'top', or 'bottom'
            align: 'center', // ('left', 'right', or 'center')
            width: 385, // (integer, or 'auto')
            delay: 5000,
            allow_dismiss: true,
            stackup_spacing: 10 // spacing between consecutively stacked growls.
          });

          return false;
        }

        last = rawdata[i][0];
    }

    var profile = { "type": "profile", "data": data, "name": name }
    var put = { "cmd": "PUT", "profile": profile }

    var put_cmd = JSON.stringify(put);

    ws_storage.send(put_cmd);

    leaveEditMode();
}

function get_tick_size() {
//switch(time_scale_profile){
//  case "s":
//    return 1;
//  case "m":
//    return 60;
//  case "h":
//    return 3600;
//  }
return 3600;
}

function getOptions()
{

  var options =
  {

    series:
    {
        lines:
        {
            show: true
        },

        points:
        {
            show: true,
            radius: 5,
            symbol: "circle"
        },

        shadowSize: 3

    },

	xaxis:
    {
      min: 0,
      tickColor: 'rgba(216, 211, 197, 0.2)',
      tickFormatter: timeTickFormatter,
      tickSize: get_tick_size(),
      font:
      {
        size: 14,
        lineHeight: 14,        weight: "normal",
        family: "Digi",
        variant: "small-caps",
        color: "rgba(216, 211, 197, 0.85)"
      }
	},

	yaxis:
    {
      min: 0,
      tickDecimals: 0,
      draggable: false,
      tickColor: 'rgba(216, 211, 197, 0.2)',
      font:
      {
        size: 14,
        lineHeight: 14,
        weight: "normal",
        family: "Digi",
        variant: "small-caps",
        color: "rgba(216, 211, 197, 0.85)"
      }
	},

	grid:
    {
	  color: 'rgba(216, 211, 197, 0.55)',
      borderWidth: 1,
      labelMargin: 10,
      mouseActiveRadius: 50
	},

    legend:
    {
      show: true,
      position: "nw",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      labelBoxBorderColor: "rgba(255, 255, 255, 0.2)"
    }
  }

  return options;

}



$(document).ready(function()
{

    if(!("WebSocket" in window))
    {
        $('#chatLog, input, button, #examples').fadeOut("fast");
        $('<p>Oh no, you need a browser that supports WebSockets. How about <a href="http://www.google.com/chrome">Google Chrome</a>?</p>').appendTo('#container');
    }
    else
    {

        renderZoneSelector();  // Hides the zone selector
        // No zone change handler needed - all zones work together now

        // Create zone-specific sockets now that the DOM is ready
        connectZoneSockets();


        // Config Socket /////////////////////////////////

        ws_config.onopen = function()
        {
            ws_config.send('GET');
        };

        ws_config.onmessage = function(e)
        {
            console.log (e.data);
            x = JSON.parse(e.data);
            temp_scale = x.temp_scale;
            time_scale_slope = x.time_scale_slope;
            time_scale_profile = x.time_scale_profile;
            kwh_rate = x.kwh_rate;
            currency_type = x.currency_type;

            if (x.zones && x.zones.length) {
                // Update zone information from server if provided
                for (var i = 0; i < x.zones.length && i < available_zones.length; i++) {
                    if (x.zones[i].name) {
                        available_zones[i].name = x.zones[i].name;
                        graph['live_zone' + i].label = x.zones[i].name;
                    }
                }
                renderZoneSelector();
                updateGraphPlot();
            }

            if (temp_scale == "c") {temp_scale_display = "C";} else {temp_scale_display = "F";}

            // Update zone labels with new temperature scale
            updateZoneLabels();

            $('#act_temp_scale').html('º'+temp_scale_display);
            $('#target_temp_scale').html('º'+temp_scale_display);
            $('#heat_rate_temp_scale').html('º'+temp_scale_display);

            switch(time_scale_profile){
                case "s":
                    time_scale_long = "Seconds";
                    break;
                case "m":
                    time_scale_long = "Minutes";
                    break;
                case "h":
                    time_scale_long = "Hours";
                    break;
            }

        }

        // Control Socket ////////////////////////////////

        // Storage Socket ///////////////////////////////

        ws_storage.onopen = function()
        {
            ws_storage.send('GET');
        };


        ws_storage.onmessage = function(e)
        {
            message = JSON.parse(e.data);

            if(message.resp)
            {
                if(message.resp == "FAIL")
                {
                    if (confirm('Overwrite?'))
                    {
                        message.force=true;
                        console.log("Sending: " + JSON.stringify(message));
                        ws_storage.send(JSON.stringify(message));
                    }
                    else
                    {
                        //do nothing
                    }
                }

                return;
            }

            //the message is an array of profiles
            //FIXME: this should be better, maybe a {"profiles": ...} container?
            profiles = message;
            //delete old options in select
            $('#e2').find('option').remove().end();
            // check if current selected value is a valid profile name
            // if not, update with first available profile name
            var valid_profile_names = profiles.map(function(a) {return a.name;});
            if (
              valid_profile_names.length > 0 &&
              $.inArray(selected_profile_name, valid_profile_names) === -1
            ) {
              selected_profile = 0;
              selected_profile_name = valid_profile_names[0];
            }

            // fill select with new options from websocket
            for (var i=0; i<profiles.length; i++)
            {
                var profile = profiles[i];
                //console.log(profile.name);
                $('#e2').append('<option value="'+i+'">'+profile.name+'</option>');

                if (profile.name == selected_profile_name)
                {
                    selected_profile = i;
                    $('#e2').select2('val', i);
                    updateProfile(i);
                }
            }
        };


        $("#e2").select2(
        {
            placeholder: "Select Profile",
            allowClear: true,
            minimumResultsForSearch: -1
        });


        $("#e2").on("change", function(e)
        {
            updateProfile(e.val);
        });

    }
});
