var map;
var colorTable = [100, 'purple',50,'red',30,'orange',0,'green',-1,'black'];	// default Fabraufteilung der Werte
var marker = [];
var sBreit = 30;
var infowindow;
var first = true;
var boundBox;
var newBound = false;
var geocod;


var w = $('#btnTraf span').width();
$('#btnTraf').css('width',w+30);

// Karte und die Marker erzeugen
function initMap() {												// Map initialisieren
    var trafficLayer;
    var myLatLng = {lat: 48.784373, lng: 9.182};					// Zentrum

    // 'globale' Variable
    infowindow = new google.maps.InfoWindow;
    geocod = new google.maps.Geocoder;

    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 13,													// Start-Zoom-Wert
        center: myLatLng,
		maxZoom: 17,                                                // max. Zoom Level
        scrollwheel: false,
    });

    var town = localStorage.getItem('defaultmapCenter');
    if ((town == "") || (town == null)) {
        town = 'Stuttgart';
    }
    setCenter(town);


    $('#btnBack').click(function() {
        var sensor = localStorage.getItem('currentSensor');
        if((sensor == "") || (sensor == null)){
            sensor = localStorage.getItem('defaultSensor');
            if((sensor == "") || (sensor == null)) {
                sensor = "140";
            }
        }
        window.location = "/"+sensor;
    });


    $('#btnHelp').click(function() {
        dialogHelp.dialog("open");
    });


    $('#btnCent').click(function() {
        infowindow.setContent("");
        infowindow.close();								// löschen
        dialogCenter.dialog("open");
    });

    $('#btnTraf').click(function() {
        trafficLayer = new google.maps.TrafficLayer();
        var t = $('#btnTraf').text();
//        if(t == "Verkehr einblenden") {
            trafficLayer.setMap(map);
//            $('#btnTraf').text('Verkehr ausblenden');
//        } else {
//            trafficLayer.setMap(null);                    // <<<<< that doesn't work !!!
//            $('#btnTraf').text('Verkehr einblenden');
//        }
    });



    var dialogHelp = $('#dialogWinHelpM').dialog({
        autoOpen: false,
        width: 800,
        title: 'Info',
        position: {my:'center', at: 'top', of:'#map'},
        open: function() {
            $('#page-mask').css('visibility','visible');
            $(this).load('/fsdata/helpmap')
        },
        close: function() {
            $('#page-mask').css('visibility','hidden');
            $('#btnHelp').css('background','#0099cc');

        },
    });


    var dialogCenter = $('#dialogCenter').dialog({
        autoOpen: false,
        width: 800,
        title: 'Zentrieren',
        open: function() {
            $('#page-mask').css('visibility','visible');
            $(this).load('/fsdata/centermap', function() {
                $('#newmapcenter').focus();
            });
        },
        buttons: [
            {
                text: "OK",
                class: 'btnOK',
                click: setNewCenter,
                style: "margin-right:40px;",
                width: 100,
            },{
                text: "Abbrechen",
                click : function() {
                    dialogCenter.dialog("close");
                },
                style: "margin-right:40px;",
                width: 100,
            }
        ],
        modal: true,
        close: function() {
            $('#page-mask').css('visibility','hidden');
        },
    });

    $('.dialog').keypress(function(e) {
        if (e.keyCode == 13) {
            $('.btnOK').focus();
        }
    });


    // Listener für das Ändern des ZOOM-Level:
	// Wenn der Zoom-Level > 15 wird, dann die Säulen abh. vom Level in der Dicke anpassen
    map.addListener('zoom_changed', function() {
        clearMarker();
    	var zl = map.getZoom();
        console.log("Zoom: ", zl);
        if (zl > 17) {
            sBreit = 60;
            for (var m = 0; m < marker.length; m++) {
                marker[m].setIcon(getBalken(marker[m].werte[0], 60, 0))
            }
        } else if (zl > 16) {
            sBreit = 50;
            for (var m = 0; m < marker.length; m++) {
                marker[m].setIcon(getBalken(marker[m].werte[0], 50, 0))
            }
        } else if (zl > 15) {
            sBreit = 40;
        	for(var m=0; m<marker.length; m++) {
        		marker[m].setIcon(getBalken(marker[m].werte[0],40,0))
			}
		} else {
            sBreit = 30;
            for(var m=0; m<marker.length; m++) {
                marker[m].setIcon(getBalken(marker[m].werte[0],30,0))
            }
		}
    });

    map.addListener('bounds_changed',function() {
        console.log("bounds changed");
        newBounds = true;
    });


    map.addListener('idle',function() {
        var info = infowindow.getContent();
        if (newBounds) {
            newBounds == false;
            boundBox = map.getBounds().toJSON();
            first = true;
            clearMarker();
            fetchAktualData();
        }
        if (!((info == undefined) || (info == ""))) {
            var sid = infowindow.anchor.sensorid;
            for(var x = 0; x < marker.length; x++) {
                if (marker[x].sensorid == sid) {
                    infowindow.open(map,marker[x]);
                    break;
                }
            }
//            console.log("Info on screen >"+info+"<");
        }
    });


    //  Alle Marker neu zeichen
    function redrawMarker() {
        for (var k = 0; k < marker.length; k++) {
            marker[k].setMap(null)                                                                      // Marker löschen
            marker[k].setMap(map);                                                                      // und wieder zeichnen
        }
    }


    function setNewCenter() {
        var town = $('#newmapcenter').val();
        if ((town == "") || (town == null)) {
            town = 'Stuttgart';
        }
        setCenter(town);
        dialogCenter.dialog("close");
        $('#btnCent').css('background','#0099cc');
    }

    google.maps.event.addListener(infowindow,'closeclick',function(){
        infowindow.setContent("");
    });

}



// Umrechnung Koordinaten auf Adresse
function geocodeLatLng(latlon) {
    geocod.geocode({'location': latlon}, function(results, status) {
        if (status === google.maps.GeocoderStatus.OK) {
            for (var i =0; i<results.length; i++) {
                console.log(results[i].formatted_address)
            }
            console.log("DAS ist GUT:",results[2].formatted_address);
        } else {
            window.alert('Geocoder failed due to: ' + status);
        }
    });
}


// Map auf Stadt setzen
function setCenter(adr) {
    geocod.geocode({'address' : adr}, function(results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
            map.setCenter(results[0].geometry.location);
            boundBox = map.getBounds().toJSON();
            newBounds = true;
        }
    });
}


// Sets the map on all markers in the array.
function setMapOnAll(map) {
    for (var i = 0; i < marker.length; i++) {
        marker[i].setMap(map);
    }
}

// Alle Marker löschen
function clearMarker() {
    setMapOnAll(null)
}

function removeOneMarker(n) {
    marker[n].setMap(null);
}

// Aktuelle Daten vom Server holen
function fetchAktualData() {
    $.getJSON('/mapdata/getaktdata', boundBox, function (data1, err) {	// JSON-Daten vom Server holen
        if (err != 'success') {
            alert("Fehler <br />" + err);						// ggf. fehler melden
        } else {
            if (first) {
                buildMarkers(data1.avgs);								// mit den Daten die Marker bauen
                first = false;
            } else {
                updateValues(data1.avgs);
            }
            showLastDate(data1.lastDate);
        }
    });
}

// Show the last date below tha map grafics
function showLastDate(dt) {
    var ld = moment(dt);
    $("#mapdate").html("Werte von " + ld.format('YYYY-MM-DD HH:mm'));
}


// Aus den GeoDaten und dem akt. Feinstaubwert den Marker bauen. Es wird eine
// Säule erzeugt mit 20 Pixel Duchmesswer und Höhe abh. vom Feinstaubwert
// Zusätzlich wird die Säule eingefärbt (<30 : grün, >= 30  : orange, >=50 : rot, >=100: violett)
// Übergabe:
//		height		Höhe der Säulke = akt. Feinstaubwert
//		breit  		Durcjmesser der säule (default 20)
//		offset 		Verschiebung des Mittelpunktes (falls 2 Säulen überlappen)
// Rückgabe:
//		das erzeugte 'balken'-Objekt
function getBalken(height,breit,offset) {
    var startx = offset - (breit/2);							// Kresimittelpunkt =^= Koordinatenpunkt

    let color ;
    for (let c=0; c<=colorTable.length; c+=2) {					// Farbzuordnun anhand der
        if (height >= colorTable[c]) {							// Tafel bestimmen
            color = colorTable[c+1];
            break;
        }
    }
    /* zylindrische Säule */
    if (height < 0 )  { height = 0;}
    if(height >101) { height = 101; }
    var rx = breit/2, ry = breit/4;								// x- und y-Radius der Ellipse
    var pstr =													// SVG-Pfad für die Säule
        'M ' + startx + ',0 ' +
        'a ' + rx + ' ' + ry + ',0,0,0,'+ (rx*2) +' 0 '+
        'v -' + height + ', ' +
        'a ' + rx + ' ' + ry + ',0,0,0,-'+ (rx*2) +' 0 z ' +
        'm 0,-' + height +
        'a ' + rx + ' ' + ry + ',0,0,0,'+ (rx*2) +' 0 ';

    var balken = {												// Balken-Objekt erzeugen
        path: pstr,
        fillColor: color,
        fillOpacity: 0.6,										// ein wenig durchsichtig
        scale: 1,
        strokeColor: 'black',									// schwarze Umrandung
        strokeWeight: 1,
    };
    return balken;
}

// die Marker erzeugen
// Übergabe
//		data		aktuelle Daten vom Server
function buildMarkers(data) {
    var lold = 0.0;												// Merke für den Längengrad
//    clearMarker();
    marker = [];
    for (x in data) {											// alle daten durchgehen
        var offset = 0;											// deault Offset ist 0
        var item = data[x];
        if (item.loc[0] == lold ) {					            // Wenn Marker auf gleicher Lönge liegen, dann
            offset = 5;											// enen neuen etwas nach rechts verscheiben
        }
        lold = item.loc[0];							            // und die Länge merken
        var oneMarker = new google.maps.Marker({				// Marker-Objekt erzeugen
            position: new google.maps.LatLng(item.loc[1],item.loc[0]), // mit den Koordinaten aus den daten
            icon: getBalken(item.value10,sBreit,offset),			// die Säule dazu
            werte: [item.value10, item.value25],				// auch die Werte mit speichern
            sensorid: item.id,						        	// und auch die Sensor-Nummer
            url: '/'+item.id,		    						// URL zum Aufruf der Grafik
            latlon:  {lat: parseFloat(item.loc[1]), lng: parseFloat(item.loc[0])}, // und extra nocmla die
            // Koordinaten
            offset: offset,
        });
        marker[x] = oneMarker;									// diesen Marker in das Array einfogen
//        removeOneMarker(x);
        // Click event an den Marker binden. Wenn geklickt wird, dann ein
        // Info-Window mit den Werte aufpoppen lassen.
        google.maps.event.addListener(marker[x], 'click', function () {
            if(this.werte[0]  < 0) {
                var seit = (this.werte[0] == -2) ? 'Woche' : 'Stunde';
                var infoContent = '<div id="infoTitle"><h4>Sensor: ' + this.sensorid + '</h4>' +
                    '<div id="infoTable">' +
                    '<table><tr>' +
                    '<td>Dieser Sensor hat seit mind. </td>' +
                    '</tr><tr>' +
                    '<td>1 ' + seit + ' keinen Wert gemeldet</td>' +
                    '</tr></table>' +
                    '</div>' +
                    '</div>';
            } else {
                var infoContent = '<div id="infoTitle"><h4>Sensor: ' + this.sensorid + '</h4>' +
                    '<div id="infoTable">' +
                    '<table><tr>' +
                    '<td>P10_m5</td><td>' + this.werte[0] + '</td>' +
                    '</tr><tr>' +
                    '<td>P2.5_m5</td><td>' + this.werte[1] + '</td>' +
                    '</tr></table>' +
                    '</div>' +
                    '<div id="infoHref">' +
                    '<a href=' + this.url + '>Grafik anzeigen</a>' +
                    '</div>' +
                    '</div>';
            }
            if (infowindow.getContent() != "") {				// ein schon offenes InfoWindow
                infowindow.close();								// löschen
            }													// und das Neue mit den Werten
            infowindow.setContent(infoContent);
            infowindow.open(map, this);							// am Marker anzeigen
            geocodeLatLng(this.latlon);
        });
        marker[x].setMap(map);									// dann  hin zeichnen
    }

}

function updateValues(data) {
    for (x in data) {
//        marker[x].setMap(null);
        var item = data[x];
        if(marker[x] ==  undefined) {
            console.log("Marker["+x+"] undefined");
        }
        marker[x].icon = getBalken(item.value10, sBreit, marker[x].offset);
        marker[x].setMap(map);
    }
}


