var express = require('express');
var router = express.Router();
var moment = require('moment');
var mathe = require('mathjs');

// Mongo wird in app.js geöffnet und verbunden und bleibt immer verbunden !!

//Get readings for all data out ot the database
router.get('/getfs/:week', function (req, res) {
    var week = req.params.week;
    var sensorid = req.query.sensorid;
    var sensorname = req.query.sensorname;
    var db = req.app.get('dbase');
    var st = req.query.start;
    var data = { 'error': 'OK'};
    var samples = req.query.samples;
//    console.log(sensorid,sensorname,samples);
    if (week == 'oneday') {
        getDayData(db, sensorid, sensorname, st).then(erg => res.json(erg));
    } else if (week == 'oneweek') {
        getWeekData(db, sensorid, sensorname, st).then(erg => res.json(erg));
    } else if ((week == 'oneyear') || (week == 'onemonth')) {
        data['docs'] = getYearData(db, sensorid, sensorname, st, week).then(erg => res.json(erg));
    } else if (week == 'latest') {
        getLatestValues(db, sensorid, sensorname, samples).then(erg => res.json(erg));
    } else if (week == 'korr') {
        getKorrelation(db, sensorid).then(erg => res.json(erg));
    } else if (week == "oldest") {
        getOldestEntry(db,sensorid,sensorname).then(erg  => res.json(erg));
    } else {
        data = {'error': 'MIST VERDAMMTER!!'}; res.json(data);
    }
});


/*
Für die übergeben SensotID den Eintrag in der KorrelationTabelle zurückgeben
*/
function getKorrelation(db,sensorid) {
    console.log('GetKorrelation für ' + sensorid);
    var p = new Promise(function(resolve,reject) {
        var colstr = 'korrelations';
        var collection = db.collection(colstr);
        var si = parseInt(sensorid);
        if (isNaN(si)) {
            si = sensorid;
        }
        collection.find({'sensors.id' : si}).toArray(function(e,docs) {
            if(e != null) {
                rejet(e);
            }
            console.log(docs.length + " Daten gelesen für " + sensorid + ' bei korrelation')
            resolve(docs)
        });
    });
    return p;
}

/* für den übergebenen Sensor das Datum des ältesten Eintrages übergene
 */
function getOldestEntry(db,sid,sname) {
    var p = new Promise(function (resolve,reject) {
        var colstr = 'data_' + sid + '_' + sname;
        var collection = db.collection(colstr);
        collection.findOne({},{sort: {date:1}}, function(err,entry){
            if (err != null) { reject (err); }
            resolve(entry.date);
        });
    })  ;
    return p;
}


/*
 Die neuesten 'samples' Werte ( d.h. die letzten 'samples' min) holen, davon den Mittelwert bilden (von Hand) und
 dieses dann zurückgeben.
 */
function getLatestValues(db,sensorid,sensorname,samples) {
    console.log("GetLatest  " + sensorid + "  " + sensorname + "  " + samples);
    var p = new Promise(function(resolve,reject) {
        var colstr = 'data_' + sensorid + '_' + sensorname;
        var collection = db.collection(colstr);
        if (samples == undefined) {
            samples = 10;
        }
        var start = moment().subtract(samples,'m');
        var end = moment();
        console.log(start,end);
        collection.find({
            date: {
                $gte: new Date(start),
                $lt: new Date(end)
            }
        }, {sort: {date: 1}}).toArray(function (e, docs) {
            if (e != null) {
                reject(e);
            }
            console.log(docs.length + " Daten gelesen für " + sensorname + ' bei latest')
            var y;
            if ((sensorname == "SDS011") || (sensorname == "PMS3003")) {
                y = calcMinMaxAvgSDS(docs);
                resolve({'P1':y.P10_avg,'P2':y.P2_5_avg});
            } else if (sensorname == "DHT22") {
                y = calcMinMaxAvgDHT(docs);
                resolve({'T':y.temp_avg, 'H':y.humi_avg});
            } else if (sensorname == "BMP180") {
                y =  calcMinMaxAvgBMP(docs);
                resolve({'T':y.temp_avg, 'P':y.press_avg});
            } else if (sensorname == "BME280") {
                y = calcMinMaxAvgBME(docs);
                resolve({'T':y.temp_avg, 'H':y.humi_avg, 'P': y.press_avg });
            }
        });
    });
    return p;
}


/****  TODO für das Display  ****
    Zur einfachen Anzeige der atuellen Werte (für das Display z.B.):
    Hier oben die Abfrage für die aktuellen Werte eines Sensors bzw. einer Location reinbasteln:
    Wenn :week keine der obigen Bedingungen erfüllt und eine Zahl ist, dann für diese Sensornummer
    (falls sie existiert) die neuesten Werte aus der DB holen und als einen JSON-String übergeben.
    Evtl. die 30min-Werte nehmen oder auch nur 5min-Mittelwerte.
    Format könnte sein:
        {"P1":"23.5", "P2":"4.5", "T":"12.4","H":"56","P":"1003"}
     Es müssen also über die Korrelation-Collection die zugehörigen Sensorren dazu gelesen werden.
 ******/


// Daten für einen Tag aus der Datenbank holen
function getDayData(db,sensorid,sensorname, st) {
    var p = new Promise(function(resolve,reject) {              // Promise erzeugen
        var start = moment(st);                                 // Zeiten in einen moiment umsetzen
        var end = moment(st);
        var colstr = 'data_' + sensorid + '_' + sensorname;
        var collection = db.collection(colstr);
        start.subtract(24, 'h');
//            console.log(colstr,start,end);
        collection.find({
            date: {
                $gte: new Date(start),
                $lt: new Date(end)
            }
        }, {sort: {date: 1}}).toArray(function (e, docs) {
            if (e != null) {
                reject(e);
            }
            console.log(docs.length + " Daten gelesen für " + sensorname + ' bei day')
            if (docs.length == 0) {
                resolve({'docs': []})
            };
//              console.log("Inhalt 2-2 von 'others':",others);
                if (sensorname == "SDS011") {
                    var x = calcMovingAverage(docs, 30, 'SDS011',3);
//                    var x = calcMovingMedian(docs, 30, sensorname);
                var y = calcMinMaxAvgSDS(docs);
                resolve({'docs': x, 'maxima': y }); //, 'others': others.sensors});
            } else if (sensorname == "DHT22") {
                resolve({'docs': calcMovingAverage(docs, 10, sensorname), 'maxima': calcMinMaxAvgDHT(docs)} );
            } else if (sensorname == "BMP180") {
                resolve({'docs': calcMovingAverage(docs, 10, sensorname)});
            } else if (sensorname == "BME280") {
                resolve({'docs': calcMovingAverage(docs, 10, sensorname)});
            }
        });
    });
    return p;
}

// Daten für eine Woche aus der DB holen
function getWeekData(db,sensorid,sensorname,st) {
    var p = new Promise(function(resolve,reject) {
        var start = moment(st);
        var end = moment(st);
        var colstr = 'data_' + sensorid + '_' + sensorname;
        var collection = db.collection(colstr);
        if (sensorname == "SDS011") {
            start.subtract(24*8, 'h');
        } else {
            start.subtract(24*7, 'h');
        }
        collection.find({
            date: {
                $gte: new Date(start),
                $lt: new Date(end)
            }
        }, {sort: {date: 1}}).toArray(function (e, docs) {
            if (e != null) {
                reject(e);
            }
            console.log(docs.length + " Daten gelesen für " + sensorname + ' bei week')
            if (docs.length == 0) {
                resolve({'docs': []})
            };
            if (sensorname == "SDS011") {
                var wdata = movAvgSDSWeek(docs);
//                    var y = calcMinMaxAvgSDS(wdata);
                resolve( {
                    'docs': wdata, 'maxima': "MIST"
                });
            } else if((sensorname == "DHT22") || (sensorname == "BMP180") || (sensorname == "BME280")) {
                resolve( {'docs': calcMovingAverage(docs, 10, sensorname)});
            }
        });
    });
    return p;
}


// Daten für ein ganzes Jahr abholen
function getYearData(db,sensorid,sensorname,st,what) {
    var p = new Promise(function(resolve,reject) {
        if(sensorname === undefined) {
            reslove({'docs':[]});
        }
        var start = moment(st);
        var end = moment(st);
        var colstr = 'data_' + sensorid + '_' + sensorname;
        var collection = db.collection(colstr);
        start=start.startOf('day');
        end = end.startOf('day');
        if(what == 'oneyear') {
            start.subtract(366, 'd');
        } else {
            start.subtract(32, 'd');
        }
        start.add(1,'h');                           // UTC-Anpassung !!!!!!! Sommerzeit !!!!!!!
        end.add(1,'h');
        var datRange = {date: {$gte: new Date(start), $lt: new Date(end)}};
//            console.log('datrange:', datRange);
        var sorting = {date: 1};
        var grpId = {$dateToString: {format: '%Y-%m-%d', date: '$date'}};
        var cursor;
        var stt = new Date();

        if (sensorname == 'SDS011') {
            cursor = collection.aggregate([
                {$sort: sorting},
                {$match: datRange},
                {
                    $group: {
                        _id: grpId,
                        avgP10: {$avg: '$P10'},
                        avgP2_5: {$avg: '$P2_5'},
                        count: { $sum: 1 }
                    }
                },
                {$sort: {_id: 1}}
            ]);
            cursor.toArray(function (err, docs) {
//                    console.log(docs);
                console.log("Dauer SDS:",new Date() - stt)
                resolve({'docs': docs});
            });
        } else if (sensorname == 'DHT22') {
            cursor = collection.aggregate([
                {$sort: sorting},
                {$match: datRange},
                {
                    $group: {
                        _id: grpId,
                        tempAV: {$avg: '$temperature'},
                        tempMX: {$max: '$temperature'},
                        tempMI: {$min: '$temperature'},
                    }
                },
                {$sort: {_id: 1}}
            ], {cursor: {batchSize: 1}});
            cursor.toArray(function (err, docs) {
                var min = Infinity, max = -Infinity, x;
                for (x in docs) {
                    if( docs[x].tempMI < min) min = docs[x].tempMI;
                    if( docs[x].tempMX > max) max = docs[x].tempMX;
                }
                console.log("Dauer DHT:",new Date() - stt)
                resolve({'docs':docs , 'maxima': { 'tmax': max, 'tmin': min}});
            });
        } else if ((sensorname == 'BMP180') || (sensorname == 'BME280')) {
            cursor = collection.aggregate([
                {$sort: sorting},
                {$match: datRange},
                {
                    $group: {
                        _id: grpId,
                        pressAV: {$avg: '$pressure'},
                        tempAV: {$avg: '$temperature'},
                        tempMX: {$max: '$temperature'},
                        tempMI: {$min: '$temperature'},
                    }
                },
                {$sort: {_id: 1}}
            ], {cursor: {batchSize: 1}});
            cursor.toArray(function (err, docs) {
                var min = Infinity, max = -Infinity, x;
                for (x in docs) {
                    if( docs[x].tempMI < min) min = docs[x].tempMI;
                    if( docs[x].tempMX > max) max = docs[x].tempMX;
                }
                console.log("Dauer BMP/E:",new Date() - stt)
                resolve({'docs': docs,  'maxima': { 'tmax': max, 'tmin': min}});
            });
        }
    });
    return p;
}

  function average(arr) {
	var sum = 0;
	for (var i = 0; i < arr.length; i++) {
		sum += arr[i];
	}
	return(sum/arr.length);
}

/*
function calcCappedMovingAverage(data, mav) {
    var newData = [];
    var lang = data.length;
    if ((mav != 0) && (lang >=mav)) {
        for (var k=0,i = mav; i < lang; i++,k++) {
        	var p10 = [], p25=[], sum1=0, sum2=0;
            for (var j = mav - 1; j >= 0; j--) {
                p10.push(parseFloat(data[i - j].P10));
                p25.push(parseFloat(data[i - j].P2_5));
            }
            p10.sort(function(a,b){return(a-b);});
            p25.sort(function(a,b){return(a-b);});
            for(var m = 3; m<p10.length-3; m++) {
                sum1 += p10[m];
                sum2 += p25[m];
            }
            newData[k] = {'P10_cav': sum1 / (mav-6), 'P2_5_cav': sum2 / (mav-6),
                'date': data[i].date, 'P10': data[i].P10, 'P2_5': data[i].P2_5}
        }
        return newData;
    } else {
        return data;
    }
}
*/

function calcMovingMedian(data, mav) {
    var newData = [];
    if (mav != 0) {
        for (var k=0, i = mav; i < data.length; i++, k++) {
        	var p10 = [], p25=[];
                for (var j = mav - 1; j >= 0; j--) {
                    p10.push(parseFloat(data[i - j].P10));
                    p25.push(parseFloat(data[i - j].P2_5));
                }
                p10.sort(function(a,b){return(a-b);});
                p25.sort(function(a,b){return(a-b);});
                newData[k] = {'P10_med': p10[Math.floor(mav/2)], 'P2_5_med': p25[Math.floor(mav/2)], 'date': data[i].date};
        }
        return newData;
    } else {
        return data;
    }
}

// *********************************************
// Calculate moving average over the data array.
//
//  params:
//      data:       array of data
//      mav:        time in minutes to average
//      name:       name of sensor
//      cap:        cap so many max and min values
//
// return:
//      array with averaged values
// *********************************************
function calcMovingAverage(data, mav, name, cap) {
    var newDatax = [], newData = [];
    var avgTime = mav*60;           // average time in sec

    if (avgTime === 0) {            // if there's nothing to average, then
        return data;                // return original data
    }
    // first convert date to timestamp (in secs)
    for (var i=0; i<data.length; i++) {
        data[i].date = ( new Date(data[i].date)) / 1000;       // the math does the convertion
    }
    // now calculate the average
    for (var i = 1, j=0; i < data.length; i++, j++) {
        var sum1 = 0, sum2 = 0, sum3=0, cnt1=0, cnt2=0, cnt3=0;
        var a1=[], a2=[], a3=[];
        var di = data[i].date;
        if ((name == 'SDS011') || (name == 'SDS021') || (name == 'PMS3003')) {
            for (var k = i; k > 0; k--) {
                var dk = data[k].date;
                if (dk + avgTime <= di) {
                    break;
                }
                if (data[k].P10 !== undefined) {
                    a1.push(data[k].P10);
//                    sum1 += data[k].P10;
//                    cnt1++;
                }
                if (data[k].P2_5 !== undefined) {
                    a2.push(data[k].P2_5)
//                    sum2 += data[k].P2_5;
//                    cnt2++;
                }
            }
            if(a1.length < (cap*2)+1) {
                continue;
            }
            a1.sort(function(a,b){return(a-b);});
            a1 = a1.slice(3,a1.length-3);
//            for(var m=cap; m<a1.length-cap;m++) {
//                sum1 += a1[m];
//            }
            a2.sort(function(a,b){return(a-b);});
            a2 = a2.slice(3,a2.length-3);
//            for(var m=cap; m<a2.length-cap;m++) {
//                sum2 += a2[m];
//            }
//            newData[j] = {'P10_mav': sum1 / (a1.length-(2*cap)), 'P2_5_mav' : sum2 / (a2.length-(2*cap)), 'date': data[i].date*1000,
              newDatax[j] = {'P10_mav': mathe.mean(a1), 'P2_5_mav' : mathe.mean(a2), 'date': data[i].date*1000,
                        'P10':data[i].P10, 'P2_5':data[i].P2_5};
              newData = newDatax.slice(7);
        } else if ((name == "DHT22") || (name == "BMP180") || (name == "BME280")) {
            for (var k = i; k > 0; k--) {
                var dk = data[k].date;
                if (dk + avgTime <= di) {
                    break;
                }
                if (data[k].temperature !== undefined) {
                    sum1 += data[k].temperature;
                    cnt1++;
                }
                if (data[k].humidity !== undefined) {
                    sum2 += data[k].humidity;
                    cnt2++;
                }
                if (data[k].pressure !== undefined) {
                    sum3 += data[k].pressure;
                    cnt3++;
                }
            }
            newData[j] = {'date': data[i].date * 1000 };
            if (sum1 != 0) newData[j]['temp_mav'] = sum1 / cnt1;
            if (sum2 != 0) newData[j]['humi_mav'] = sum2 / cnt2;
            if (sum3 != 0) newData[j]['press_mav'] = sum3 / cnt3;
        }
    }
    // finally shrink datasize, so that max. 1000 values will be returned
    var neu1 = [];
    var step = Math.round(newData.length / 500);
    if (step <= 1) {
        return newData;
    }
    if ((name == 'SDS011') || (name == 'SDS021') || (name == 'PMS3003')) {
        for (var i = 0, j = 0; i < newData.length; i += step, j++) {
            var d = newData.slice(i, i + step)
            var p1 = 0, p2 = 0;
            for (var k = 0; k < d.length; k++) {
                if (d[k].P10 > p1) {
                    p1 = d[k].P10;
                }
                if (d[k].P2_5 > p2) {
                    p2 = d[k].P2_5;
                }
            }
            neu1[j] = {'P10': p1, 'P2_5': p2, 'date': newData[i].date * 1000};
        }
    } else if ((name == "DHT22") || (name == "BMP180") || (name == "BME280")) {
        for (var i = 0, j = 0; i < newData.length; i += step, j++) {
            var d = newData.slice(i, i + step)
            var p1 = 0, p2 = 0, p3 = 0;
            for (var k = 0; k < d.length; k++) {
                var t = d[k].temp_mav;
                var h = d[k].humi_mav;
                var p = d[k].press_mav;
                if (t !== undefined) {
                    if (t > p1) p1 = t;
                }
                if (h !== undefined) {
                    if (h > p2) p2 = h;
                }
                if (p !== undefined) {
                    if (p > p3) p3 = p;
                }
            }
            neu1[j] = {'date' : newData[i].date};
            if (p1 != 0) neu1[j]['temp_mav'] = p1;
            if (p2 != 0) neu1[j]['humi_mav'] = p2;
            if (p3 != 0) neu1[j]['press_mav'] = p3;
        }
    }
    return neu1;
}

// für die Wochenanzeige die Daten als gleitenden Mittelwert über 24h durchrechnen
// und in einem neuen Array übergeben
function movAvgSDSWeek(data) {
    var neuData = [];
    const oneDay = 3600*24;

    // first convert date to timestam (in secs)
    for (var i=0; i<data.length; i++) {
        data[i].date = ( new Date(data[i].date)) / 1000;       // the math does the convertion
    }
    // now calculate the moving average over 24 hours
    for (var i=1, j=0; i< data.length; i++, j++) {
        var sum1=0, sum2 = 0, cnt1 = 0, cnt2 = 0;
        var di = data[i].date;
        for (var k=i; k>=0 ; k--) {
            if (data[k].date+oneDay < di) {
                break;
            }
            if (data[k].P10 !== undefined) {
                sum1 += data[k].P10;
                cnt1++;
            }
            if (data[k].P2_5 !== undefined) {
                sum2 += data[k].P2_5;
                cnt2++;
            }
        }
        neuData[j] = {'P10': sum1 / cnt1, 'P2_5': sum2 / cnt2, 'date': data[i].date} ;
    }
    // finally shrink datasize, so that max. 1000 values will be returned
    var neu1 = [];
    var step = Math.round(neuData.length / 500);
    if (step == 0) step = 1;
    for (var i = 0, j=0; i < neuData.length; i+=step, j++) {
        var d = neuData.slice(i,i+step)
        var p1=0, p2=0;
        for(var k=0; k<d.length; k++) {
            if (d[k].P10 > p1) {
                p1 = d[k].P10;
            }
            if (d[k].P2_5 > p2) {
                p2 = d[k].P2_5;
            }
        }
        neu1[j] = {'P10': p1, 'P2_5': p2, 'date': neuData[i].date*1000} ;
    }
    return neu1;
}






function movAvgSDSWeek_old(data) {
    var neuData = [];
    for (var i = 1440, j=0; i < data.length; i+=1, j++) {
        var sum1=0, sum2 = 0, cnt1 = 0, cnt2 = 0;
        for (var k = 1439; k >= 0; k--) {
            if(data[i - k].P10 !== undefined) {
                sum1 += data[i - k].P10;
                cnt1++;
            }
            if(data[i - k].P2_5 !== undefined) {
                sum2 += data[i - k].P2_5;
                cnt2++;
            }
        }
        neuData[j] = {'P10': sum1 / cnt1, 'P2_5': sum2 / cnt2, 'date': data[i].date} ;
    }
    var neu1 = [];
    for (var i = 10, j=0; i < neuData.length; i+=10, j++) {
        var sum1=0, sum2 = 0;
        for (var k = 10; k > 0; k--) {
            sum1 += neuData[i - k].P10;
            sum2 += neuData[i - k].P2_5;
        }
        neu1[j] = {'P10': sum1 / 10, 'P2_5': sum2 / 10, 'date': neuData[i].date} ;
    }

    return neu1;
}


function calcMinMaxAvgSDS(data) {
    var p1=[], p2=[];
    for (var i=0; i<data.length; i++) {
        p1.push(data[i].P10);
        p2.push(data[i].P2_5);
    }
    return { 'P10_max': mathe.max(p1), 'P2_5_max': mathe.max(p2),
        'P10_min': mathe.min(p1), 'P2_5_min': mathe.min(p2),
        'P10_avg' : mathe.mean(p1), 'P2_5_avg' : mathe.mean(p2) };
}

function calcMinMaxAvgDHT(data) {
    var t=[], h=[];
    for (var i=0; i<data.length; i++) {
        t.push(data[i].temperature);
        h.push(data[i].humidity);
    }
    return { 'temp_max': mathe.max(t), 'humi_max': mathe.max(t),
        'temp_min': mathe.min(t), 'humi_min': mathe.min(h),
        'temp_avg' : mathe.mean(t), 'humi_avg' : mathe.mean(h) };
}


function calcMinMaxAvgBMP(data) {
    var t=[], p=[];
    for (var i=0; i<data.length; i++) {
        t.push(data[i].temperature);
        p.push(data[i].pressure);
    }
    return { 'temp_max': mathe.max(t), 'press_max': mathe.max(p),
    'temp_min': mathe.min(t), 'press_min': mathe.min(p),
    'temp_avg' : mathe.mean(t), 'press_avg' : mathe.mean(p) };
}

function calcMinMaxAvgBME(data) {
    var t=[], h=[], p=[], sumt=0;
    for (var i=0; i<data.length; i++) {
        t.push(data[i].temperature);
        h.push(data[i].humidity);
        p.push(data[i].pressure);
    }
    return { 'temp_max': mathe.max(t), 'humi_max': mathe.max(h), 'press_max': mathe.max(p),
    'temp_min': mathe.min(t), 'humi_min': mathe.min(h), 'press_min': mathe.min(p),
    'temp_avg' : mathe.mean(t), 'humi_avg' : mathe.mean(h), 'press_avg' : mathe.mean(p) };
}

/*
// Fetch the actual out of the dbase
router.get('/getaktdata/', function (req, res) {
	// First get location and espid from korrelation-Table
    var db = req.app.get('dbase');
    var cursor = db.collection('korrelation').find();
    var aktData = [];
    cursor.each(function(err,item) {
    	var oneAktData = {};
    	for (var i=0; i< item.sensors.length; i++) {
    		if (item.sensors.name == 'SDS011') {				// nur SDS011 verwenden
    			oneAktData['latitude'] = item.latitude;
    			oneAktData['longitude'] = item.longitude;
    			oneAktData['espid'] = item.espid;
    			break;
    		}
    	}
    	if ( typeof oneAktData.espid != 'undefined') {
    		aktData.push(oneAktData);
    	}
    });
    console.log(aktData);
});	
	
*/
	
	
module.exports = router;
