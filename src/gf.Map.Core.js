/**
 * @class
 * @classdesc
 * @param _map {Object} GoogleMap實例
 */
function GEEMap(_map) {
    var o = this;
    var map = _map;
    // Initialize the layers data.
    map.layerMap = {};
    map.layerVisible = {};
    map.layerName = {};
    map.options = {};
    map.layerIds = [];
    map.kmlLayer = {};
    map.wmsLayer = [];
    map.geojsonLayer = {};

    var locateMarkers = [];
    var locateInfo = new google.maps.InfoWindow();

    var locateDataLayer = new google.maps.Data({
        map: map,
        style: {
            fillColor: '#FF0000',
            fillOpacity: 0.33,
            strokeColor: '#FF0000',
            strokeOpacity: 0.5,
            strokeWeight: 2
        }
    });
    locateDataLayer.addListener('click', function(e){
        var content = "<div style='padding: 10px;'>";
        e.feature.forEachProperty(function(value){
            content += "<p>" + value + "</p>";
        });
        content += "</div>";
        locateInfo.setContent(content);
        locateInfo.setPosition(e.latLng);
        locateInfo.open(map);
    });
    var locateDataPool = [];

    // from fusion_extended_map.js
    var MAX_ZOOM_LEVEL = 23;
    var TILE_WIDTH = 256;
    var TILE_HEIGHT = 256;

    /* constructor */
    map.geeFusionLayer = function (index, overlay) {
        this.index = index;
        this.overlay = overlay;
    }

    function geeMapTileFunc(request, server,
        glmId, channel, version) {
        return function (coord, zoom) {
            var numTiles = 1 << zoom;

            // Don't wrap tiles vertically.
            if (coord.y < 0 || coord.y >= numTiles) {
                return null;
            }

            // Wrap tiles horizontally.
            var x = ((coord.x % numTiles) + numTiles) % numTiles;

            var glmPath = '';
            if (glmId) {
                glmPath = '/' + glmId;
            }

            // For simplicity, we use a tileset consisting of 1 tile at zoom level 0
            // and 4 tiles at zoom level 1.
            var url = server + glmPath + '/query?request=' + request;

            url += '&channel=' + channel + '&version=' + version + '&x=' + x +
                '&y=' + coord.y + '&z=' + zoom;
            return url;
        };
    }

    function geeMapImageryFunc(
        requestType, server, glmId, channel, version) {
        return geeMapTileFunc(
            requestType, server, glmId, channel, version);
    }

    function geeMapVectorFunc(server, glmId, channel, version) {
        return geeMapTileFunc(
            'VectorMapsRaster', server, glmId, channel, version);
    }

    function geeIsImageryLayer(layer) {
        return (layer.requestType.search('Imagery') != -1);
    }

    //this.addGEE = function(domId, imgName, geeId, url) {
    map.addGEE = function (imgName, geeId, url, storage) {
        var DEFAULT_INTERVAL = 50;
        var DEFAULT_TIMEOUT = 5000;
        /**
         * Waits for predicate to be truthy and resolves a Promise
         * https://github.com/devlato/waitUntil
         *
         * @param  predicate  Function  Predicate that checks the condition
         * @param  timeout  Number  Maximum wait interval, 5000ms by default
         * @param  interval  Number  Wait interval, 50ms by default
         * @return  Promise  Promise to return a callback result
         */
        function waitUntil(
            predicate,
            timeout,
            interval
        ) {
            var timerInterval = interval || DEFAULT_INTERVAL;
            var timerTimeout = timeout || DEFAULT_TIMEOUT;

            return new Promise(function promiseCallback(resolve, reject) {
                var timer;
                var timeoutTimer;
                var clearTimers;
                var doStep;

                clearTimers = function clearWaitTimers() {
                    clearTimeout(timeoutTimer);
                    clearInterval(timer);
                };

                doStep = function doTimerStep() {
                    var result;

                    try {
                        result = predicate();

                        if (result) {
                            clearTimers();
                            resolve(result);
                        } else {
                            timer = setTimeout(doStep, timerInterval);
                        }
                    } catch (e) {
                        clearTimers();
                        reject(e);
                    }
                };

                timer = setTimeout(doStep, timerInterval);
                timeoutTimer = setTimeout(function onTimeout() {
                    clearTimers();
                    reject(new Error('Timed out after waiting for ' + timerTimeout + 'ms'));
                }, timerTimeout);
            });
        };
        var d = new Date().getTime();
        var defKey = "geeServerDefs" + `${ d }`;

        var script = document.createElement('script');
        script.src = url + '/query?request=Json&var=' + defKey + '&timestamp=' + d;
        document.getElementsByTagName('head')[0].appendChild(script);

        waitUntil(function () {
            try {
                eval(defKey);
            } catch (e) {
                return false
            }
            return !(typeof eval(defKey) === 'undefined' || eval(defKey) === null);
        }, 10000).then(function (result) {
            storage[geeId + d] = JSON.parse(JSON.stringify(eval(defKey)));
            map.initializeLayers(storage[geeId + d], imgName, geeId);
            // map type update
            updateMapType(map, 'unshift', geeId);
            // set default type
            map.setMapTypeId(geeId);
        }).catch(function (error) {
            console.log(error);
        })
    }

    function updateMapType(map, method, mt_id) {
        if (!map) return false;

        var maptypes = map.mapTypeControlOptions.mapTypeIds;

        //unshift：放到最前
        if (method == 'unshift') maptypes.unshift(mt_id);
        //push：放到最後
        if (method == 'push') maptypes.push(mt_id);

        map.mapTypeControlOptions.mapTypeIds = maptypes;
    }

    /**
     * Initialize all layers defined in the server defs.
     * @param {object} serverDefs Struct of map layers, base url, etc.
     */
    /* imgName: every geemap has only one imagery , so user define the name */
    /* geeId: custom define a id */
    map.initializeLayers = function (serverDefs, imgName, geeId) {

        this.imgName = imgName;
        this.geeId = geeId;

        var layerDefs = serverDefs.layers;
        var serverUrl = serverDefs.serverUrl;

        if (layerDefs == undefined || layerDefs.length == 0) {
            alert('Error: No Layers are defined for this URL.');
            return;
        }

        // Create tile layers.
        // The base map was created with an empty tile function so that we can
        // also add the "base" layer here instead of treating it as an exception.
        // By treating it uniformly, its visibility can be controlled.
        var numLayers = this.layerIds.length;

        for (var i = 0; i < layerDefs.length; ++i) {
            this.overlayMapTypes.push(null);
            var name = layerDefs[i].label;
            var channel = layerDefs[i].id;
            // Use layer glm_id if it is defined. Otherwise, set it to 0.
            var glmId = layerDefs[i].glm_id;
            if (typeof (glmId) == 'undefined') {
                glmId = 0;
            }
            var requestType = layerDefs[i].requestType;
            var version = layerDefs[i].version;
            var enabled = layerDefs[i].initialState;
            var isPng = layerDefs[i].isPng;
            if (layerDefs[i].requestType == 'VectorMapsRaster') {
                this.addLayer(name, numLayers, map, isPng,
                    geeMapVectorFunc(serverUrl, glmId, channel, version),
                    glmId, channel, enabled);
            } else if (geeIsImageryLayer(layerDefs[i])) {
                this.addLayer(name, numLayers, map, isPng,
                    geeMapImageryFunc(
                        requestType, serverUrl, glmId, channel, version),
                    glmId, channel, enabled);
            }
            // geeId
            this.layerIds[numLayers++] = geeId + '_' + glmId + '-' + channel;
        }
    };

    /**
     * Adds a layer as an overlay to the map.
     * @param {string} name Name of the layer.
     * @param {Number} index Index of vector layer in array of overlays.
     * @param {google.maps.ImageMapType} map The map we are adding the layer to.
     * @param {boolean} isPng Whether vector tiles are png files.
     * @param {string} urlFunction Function to get vector tiles urls.
     * @param {Number} glmId Id for this glm (set of channels).
     * @param {Number} channel Channel for this layer.
     * @param {boolean} enabled Whether vector layer is visible initially.
     */
    map.addLayer = function (
        name, index, map, isPng, urlFunction, glmId, channel, enabled) {
        var options = {
            'getTileUrl': urlFunction,
            'tileWidth': TILE_WIDTH,
            'tileHeight': TILE_HEIGHT,
            'isPng': isPng
        };

        options.maxZoom = MAX_ZOOM_LEVEL;

        if (name == 'Imagery') options.name = this.imgName;

        options.tileSize = new google.maps.Size(
            options.tileWidth, options.tileHeight);

        var overlay = new google.maps.ImageMapType(options);
        if (enabled) {
            // don't enable by default
            // map.overlayMapTypes.setAt(index, overlay);
        }
        // geeId
        var id = this.geeId + '_' + glmId + '-' + channel;
        this.layerMap[id] = new map.geeFusionLayer(index, overlay);
        this.layerVisible[id] = enabled;
        this.layerName[id] = name;
        this.options[id] = options;
        // img overlay add to maptype
        if (name == 'Imagery') map.mapTypes.set(this.geeId, overlay);
    };

    /**
     * Set opacity of given layer.
     * @param {number} id Index of overlay whose opacity is to be set.
     * @param {number} opacity Opacity ranging from 0 (clear) to 1 (opaque).
     */
    map.setOpacity = function (id, opacity) {
        var layer = this.layerMap[id];
        if (layer) {
            layer.overlay.setOpacity(opacity);
        }
    };

    /**
     * Make a vector layer visible on the map.
     * @param {string} id Layer id for the vector layer to show.
     */
    map.showFusionLayer = function (id) {
        if (typeof (this.layerMap[id]) != 'undefined') {
            this.overlayMapTypes.setAt(this.layerMap[id].index,
                this.layerMap[id].overlay);
            this.layerVisible[id] = true;

        } else {
            //  alert('Unknown layer: ' + id);
        }
    };

    /**
     * Hide a vector layer on the map.
     * @param {string} id Layer id for the vector layer to hide.
     */
    map.hideFusionLayer = function (id) {
        if (typeof (this.layerMap[id]) != 'undefined') {
            this.overlayMapTypes.setAt(this.layerMap[id].index, null);
            this.layerVisible[id] = false;
        } else {
            //  alert('Unknown layer: ' + id);
        }
    };
    /** martin:
        modified show/hide FusionLayer
      */
    map.showFusionLayerS = function (id, type) {
        if (typeof (this.layerMap[id]) != 'undefined') {

            this.layerMap[id].overlay.id = id;
            this.layerVisible[id] = true;

            var mt = this.layerMap[id].overlay;

            if (type == 'Imagery') {

                var max = this.overlayMapTypes.getLength();
                var chk = false;
                for (var i = 0; i < max; i++) {
                    var o = this.overlayMapTypes.getAt(i);
                    if (o && o.type == 'layer') {
                        this.overlayMapTypes.insertAt(i, mt);
                        chk = true;
                        break;
                    }
                }
                if (chk == false) this.overlayMapTypes.push(mt);

            } else {

                this.overlayMapTypes.push(mt);

            }

        } else {
            // alert('Unknown layer: ' + id);
        }
    };
    map.hideFusionLayerS = function (id) {
        if (typeof (this.layerMap[id]) != 'undefined') {
            var max = map.overlayMapTypes.getLength();
            for (var i = max - 1; i >= 0; i--) {
                var o = map.overlayMapTypes.getAt(i);
                if (o && o.id == id) map.overlayMapTypes.removeAt(i);
            }
            this.layerVisible[id] = false;
        } else {
            // alert('Unknown layer: ' + id);
        }
    };
    /**
     * @param {string} id Layer id for the layer to check.
     * @return {bool} whether layer is visible.
     */
    map.isFusionLayerVisible = function (id) {
        return this.layerVisible[id];
    };

    /**
     * @param {string} id Layer id for the layer to get name from.
     * @return {string} name of layer.
     */
    map.fusionLayerName = function (id) {
        return this.layerName[id];
    };

    /**
     * @param {number} index Index of the layer.
     * @return {number} id of indexed layer.
     */
    map.fusionLayerId = function (index) {
        return this.layerIds[index];
    };

    /**
     * @return {number} number of layers.
     */
    map.layerCount = function () {
        return this.layerIds.length;
    };

    /**
     * Pan and Zoom the Earth viewer to the specified lat, lng and zoom level.
     * @param {string}
     *          lat the latitude of the position to pan to.
     * @param {string}
     *          lng the longitude of the position to pan to.
     * @param {Number}
     *          zoomLevel [optional] the zoom level (an integer between 1 :
     *          zoomed out all the way, and 32: zoomed in all the way) indicating
     *          the zoom level for the view.
     */
    map.panAndZoom = function (lat, lng, zoomLevel) {
        if (zoomLevel == null) {
            zoomLevel = DEFAULT_SINGLE_CLICK_ZOOM_LEVEL;
        }

        var latLng = new google.maps.LatLng(parseFloat(lat), parseFloat(lng));
        this.panTo(latLng);
        this.setZoom(zoomLevel);
    };

    /**
     * Open the info window at the given location with the given content.
     * @param {google.maps.LatLng} position Position at which to draw the window.
     * @param {string} content The content to put into the info window.
     */
    map.openInfoWindow = function (position, content) {
        if ((typeof (this.infoWindow) == 'undefined') ||
            (this.infoWindow == null)) {
            this.infoWindow = new google.maps.InfoWindow({
                content: content,
                position: position
            });
        } else {
            this.infoWindow.setPosition(position);
            this.infoWindow.setContent(content);
        }

        this.infoWindow.open(this);
    };

    /**
     * Close the info window if it is open.
     */
    map.closeInfoWindow = function () {
        if ((typeof (this.infoWindow) == 'undefined') ||
            (this.infoWindow == null)) {
            return;
        }

        this.infoWindow.close();
        this.infoWindow = null;
    };

    /**
     * @func addWMSLayer
     * @desc 加入WMS圖層
     * @memberOf GEEMap
     * @param {string} id  圖層ID
     * @param {string} wmsurl WMS網址
     */
    map.addWMSLayer = function (id, wmsurl) {
        var wmsLayer = new google.maps.ImageMapType({
            getTileUrl: function (coord, zoom) {

                var proj = map.getProjection();
                var zfactor = Math.pow(2, zoom);
                // get Long Lat coordinates
                var top = proj.fromPointToLatLng(new google.maps.Point(coord.x * 256 / zfactor, coord.y * 256 / zfactor));
                var bot = proj.fromPointToLatLng(new google.maps.Point((coord.x + 1) * 256 / zfactor, (coord.y + 1) * 256 / zfactor));

                //corrections for the slight shift of the SLP (mapserver)
                //var deltaX = 0.0013;
                //var deltaY = 0.00058;
                var deltaX = 0;
                var deltaY = 0;

                var fixtoplng = top.lng() + deltaX;
                var fixtoplat = top.lat() + deltaY;
                var fixbotlng = bot.lng() + deltaX;
                var fixbotlat = bot.lat() + deltaY;
                var newtop;
                var newbot;
                var version = getParameterByName("version", wmsurl.toLowerCase());
                switch (version) {
                    case "1.1.0":
                    case "1.1.1":
                        newtop = proj4("EPSG:3857", "EPSG:3857", {x: fixtoplng, y: fixtoplat});
                        newbot = proj4("EPSG:3857", "EPSG:3857", {x: fixbotlng, y: fixbotlat});
                        break;
                    case "1.3.0":
                        newtop = proj4("EPSG:4326", "EPSG:3857", {x: fixtoplng, y: fixtoplat});
                        newbot = proj4("EPSG:4326", "EPSG:3857", {x: fixbotlng, y: fixbotlat});
                        break;
                }
                var bbox =
                    newtop.x + "," +
                    newbot.y + "," +
                    newbot.x + "," +
                    newtop.y;


                //base WMS URL
                var urlarr = wmsurl.split('?');
                var url = urlarr[0] + '?';
                var paramarr = urlarr[1].split('&');
                paramarr.forEach(function (p) {
                    var kvo = p.split('=');
                    switch (kvo[0].toLowerCase()) {
                        case "width":
                            break;
                        case "height":
                            break;
                        case "bbox":
                            break;
                        default:
                            url += kvo[0] + '=' + kvo[1] + '&';
                            break;
                    }
                });
                url += "&BBOX=" + bbox; // set bounding box
                url += "&WIDTH=256"; //tile size in google
                url += "&HEIGHT=256";

                return url; // return URL for the tile
            },
            tileSize: new google.maps.Size(256, 256),
            isPng: true
        });
        wmsLayer.id = id;

        if (this.wmsLayer.indexOf(id) < 0) {
            this.wmsLayer.push(id);
        }

        this.overlayMapTypes.insertAt(this.layerIds.length + this.wmsLayer.indexOf(id), wmsLayer);

        this.layerVisible[id] = true;
    };

    /**
     * @func removeWMSLayer
     * @desc 移除WMS圖層
     * @memberOf GEEMap
     * @param {string} id  圖層ID
     */
    map.removeWMSLayer = function (id) {
        this.wmsLayer.forEach(function (ele, idx) {
            if (ele == id) {
                var i = map.layerIds.length + idx;
                var o = map.overlayMapTypes.getAt(i);
                if (o && o.id == id) {
                    map.overlayMapTypes.removeAt(i);
                    //map.overlayMapTypes.setAt(i, null);
                }
            }
        });

        var idx = this.wmsLayer.indexOf(id);
        this.wmsLayer.splice(idx, 1);

        this.layerVisible[id] = false;
    };

    /**
     * @func addKMLLayer
     * @desc 加入KML圖層
     * @memberOf GEEMap
     * @param {string} id  圖層ID
     * @param {string} kmlurl KML網址
     */
    map.addKMLLayer = function (id, kmlurl) {
        var kmlOptions = {
            preserveViewport: true,
            //suppressInfoWindows: true
        };
        var kmlLayer = new google.maps.KmlLayer(kmlurl, kmlOptions);
        kmlLayer.setMap(map);
        this.kmlLayer[id] = kmlLayer;
        this.layerVisible[id] = true;
    };

    /**
     * @func removeKMLLayer
     * @desc 移除KML圖層
     * @memberOf GEEMap
     * @param {string} id  圖層ID
     */
    map.removeKMLLayer = function (id) {
        var kmlLayer = this.kmlLayer[id];
        kmlLayer.setMap(null);
        this.layerVisible[id] = false;
    };


    map.setGeoJsonLayer = function (id, dataLayer) {
        if (id != undefined) {
            dataLayer.setMap(map);
            //this.geojsonLayer[id] = dataLayer;
            this.geojsonLayer[id] = {};
            this.geojsonLayer[id].data = dataLayer;
        }
    };
    map.labelGeoJsonLayer = function (id, label) {
        if (id != undefined) {
            if (this.geojsonLayer[id].label == undefined) {
                this.geojsonLayer[id].label = [];
                this.geojsonLayer[id].label.push(label)
            } else {
                this.geojsonLayer[id].label.push(label)
            }
        }
    };
    map.removeGeoJsonLayer = function (id) {
        if (id != undefined) {
            if(this.geojsonLayer[id] != undefined){
                if (this.geojsonLayer[id].data != undefined) {
                    this.geojsonLayer[id].data.setMap(null);
                }

                if (this.geojsonLayer[id].label != undefined) {
                    this.geojsonLayer[id].label.forEach(function (label) {
                        label.setMap(null);
                    });
                }

                this.geojsonLayer[id] = null;
                delete this.geojsonLayer[id];
            }
        }
    };
    map.getGeoJsonLayer = function (id) {
        if (id != undefined) {
            if(this.geojsonLayer[id] != undefined){
                return this.geojsonLayer[id].data;
            }
        }

        return undefined;
    };

    map.toggleMapLayer = function (param) {

        var lid = param.mapName + "_" + param.glmId + "-" + param.layerid2d;

        if(param.opacity != undefined) {
            this.setOpacity(lid, param.opacity);
            return;
        }

        switch (param.type) {
            case "wms":
                switch (param.selected) {
                    case true:
                        this.addWMSLayer(lid, param.kmlurl);
                        break;
                    case false:
                        this.removeWMSLayer(lid);
                        break;
                }
                break;
            case "kmlurl":
                switch (param.selected) {
                    case true:
                        this.addKMLLayer(lid, param.kmlurl);
                        break;
                    case false:
                        this.removeKMLLayer(lid, param.kmlurl);
                        break;
                }
                break;
            case "向量":
                switch (param.selected) {
                    case true:
                        if (this.layerMap[lid]) {
                            this.layerMap[lid].overlay.type = 'layer';
                        }

                        try {
                            this.showFusionLayerS(lid);

                            var mt = this.layerMap[lid].overlay;
                            Overlayopacity(mt);
                        } catch (ex) {

                        }
                        break;
                    case false:
                        this.hideFusionLayerS(lid);
                        break;
                }
                break;
        }
    };

    /**
     * @func locate
     * @desc 定位
     * @memberOf GEEMap
     * @param.mode (required) = 'marker' | 'polyline' | 'polygon'
     * param.geom (required) = { lat: [number] , lng: [number] }
     * param.title = {string}
     * param.content = {html string}
     * param.icon = {url string}
     * param.callback = {function}
     */
    map.locate = function(param) {
        // 2017-12-10 Ray
        // 目前marker模式是使用google.maps.Marker
        // polygon模式是使用google.maps.Data
        // 之後請花時間把marker模式也改成DataLayer

        // 2019-01-23 Ray
        // 已全部改為DataLayer，mode參數應該可以廢掉
        // 但並不向前相容google.maps.Marker
        switch(param.mode){
            case "marker":
                var id = (param.geom.id == undefined) ? Date.now() : param.geom.id;
                param.geom.id = id;
                locateDataLayer.addGeoJson(param.geom);

                if (param.notPanTo != true) {
                    var bounds = new google.maps.LatLngBounds();
                    locateDataLayer.getFeatureById(id).getGeometry().forEachLatLng(function (latlng) {
                        bounds.extend(latlng);
                    });
                    map.fitBounds(bounds);
                }

                map.setZoom(15);
                break;
            case "polyline":
                var id = (param.geom.id == undefined) ? Date.now() : param.geom.id;
                param.geom.id = id;
                locateDataLayer.addGeoJson(param.geom);

                if (param.notPanTo != true) {
                    var bounds = new google.maps.LatLngBounds();
                    locateDataLayer.getFeatureById(id).getGeometry().forEachLatLng(function (latlng) {
                        bounds.extend(latlng);
                    });
                    map.fitBounds(bounds);
                }
                break;
            case "polygon":
                var id = (param.geom.id == undefined) ? Date.now() : param.geom.id;
                param.geom.id = id;
                locateDataLayer.addGeoJson(param.geom);

                locateDataPool.push(param.geom);

                if (param.notPanTo != true) {
                    var bounds = new google.maps.LatLngBounds();
                    locateDataLayer.getFeatureById(id).getGeometry().forEachLatLng(function (latlng) {
                        bounds.extend(latlng);
                    });
                    map.fitBounds(bounds);
                }
                break;
        }
    };
    map.getLocateGeoJson = function () {
        var featureCollection = {
            "type": "FeatureCollection",
            "features": []
        };
        locateDataPool.forEach(function (feature) {
            featureCollection.features.push(feature);
        });
        return featureCollection;
    }

    map.locateClear = function(){
        locateMarkers.forEach(function(marker){
            marker.setMap(null);
        });
        locateMarkers = [];
        locateInfo.close();

        locateDataLayer.forEach(function(feature) {
            locateDataLayer.remove(feature);
        });

        locateDataPool = [];
    };

    function getParameterByName(name, url) {
        if (!url) url = window.location.href;
        name = name.replace(/[\[\]]/g, '\\$&');
        var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
            results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, ' '));
    };

    map.listSPOT = function () {
        var objSPOT = function (location, year, type) {
            var self = this;
            self.location = location;
            self.year = year;
            self.type = type;
            this.getCode = function () {
                return "SP" + year + self.typeCode() + "_" + locationCode() + "3857";
            }
            function locationCode() {
                if (self.location == "臺灣") {
                    return "";
                }
                else {
                    return "PH_";
                }
            }
            self.typeCode = function(){
                if (self.type == "自然色") {
                    return "NC";
                }
                else {
                    return "FC";
                }
            }
        }

        var yearStart = 1996;
        var yearEnd = 2017;
        var types = ["自然色", "假色"];
        //var locations = ["臺灣", "澎湖"];
        var locations = ["臺灣"];

        var list = [];

        for (var i = yearStart; i <= yearEnd; i++){
            locations.forEach(function (location) {
                types.forEach(function (type) {
                    list.push(new objSPOT(location, i, type));
                });
            });
        }

        return list;
    };

    /**
     * @param {boolean} toggle 開啟(true)或關閉(false)
     * @param {number} opacity 透明度(0~1)
     * @param {number} year 西元年度
     * @param {string} type 影像類型，自然色(NC)，假色(FC)
     */
    map.toggleSPOT = function (toggle, opacity, year, type) {
        if (toggle == true) {
            map.overlayMapTypes.getArray()
                .filter(function (ele) {
                    return ele != undefined
                        && ele.name
                        && ele.name.substring(0, 4) == "SPOT";
                })
                .forEach(function (ele) {
                    ele.setOpacity(0);
                });

            var idx = map.overlayMapTypes.getArray()
                .findIndex(function (ele) {
                    return ele != undefined && ele.name == 'SPOT' + year + type;
                });
            if (idx > -1) {
                var overlay = map.overlayMapTypes.getAt(idx);
                if (opacity != undefined) {
                    overlay.setOpacity(opacity);
                }
                else {
                    overlay.setOpacity(overlay.savedOpacity);
                }
            }
            else {
                var mapMinZoom = 6;
                var mapMaxZoom = 18;
                var mapBounds = new google.maps.LatLngBounds(
                    new google.maps.LatLng(21.81785406, 119.86499422),
                    new google.maps.LatLng(25.4334898, 122.05204106)
                );
                var entry;
                if (type == "NC") {
                    entry = "SP";
                }
                if (type == "FC") {
                    entry = "SP_TW_FC";
                }
                var overlay = new klokantech.MapTilerMapType(map, function (x, y, z) {
                    return "http://140.115.110.11/" + entry + "/SP" + year + type + "_3857/{z}/{x}/{y}.png".replace('{z}', z).replace('{x}', x).replace('{y}', y);
                },
                    mapBounds, mapMinZoom, mapMaxZoom
                );
                overlay.savedOpacity = 1;
                if (opacity != undefined) {
                    overlay.setOpacity(opacity);
                }
                else {
                    overlay.setOpacity(1);
                }

                overlay.name = 'SPOT' + year + type;
            }
        }
        else {
            var idx = map.overlayMapTypes.getArray()
                .findIndex(function (ele) {
                    return ele != undefined && ele.name == 'SPOT' + year + type;
                });
            if (idx > -1) {
                var overlay = map.overlayMapTypes.getAt(idx);
                overlay.savedOpacity = overlay.opacity;
                overlay.setOpacity(0);
            }
            else {
                console.log("目標overlay不存在");
            }
        }
    };
}