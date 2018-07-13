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
        // ajax jsonp get geeServerDefs
        var d = new Date().getTime(); //console.time(d);
        $.ajax({
            type: 'GET',
            dataType: 'jsonp',
            url: url + '/query?request=Json&var=geeServerDefs&timestamp=' + d,
            crossDomain: true,
            async: true,
            complete: function () { //console.timeEnd(d);
                // var geeServerDefs = {...} from jsonp;
                storage[geeId] = JSON.parse(JSON.stringify(geeServerDefs));
                geeServerDefs = null;
                //delete geeServerDefs;
                map.initializeLayers(storage[geeId], imgName, geeId);
                // map type update
                updateMapType(map, 'unshift', geeId);
                // set default type
                map.setMapTypeId(geeId);
            }
        });
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

        // domain error special case:
        serverUrl = serverUrl.replace('http://earth.3dmap.hinet.net', 'http://117.56.7.99');

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
                var deltaX = 0.0013;
                var deltaY = 0.00058;

                //create the Bounding box string
                var bbox = (top.lng() + deltaX) + "," +
                    (bot.lat() + deltaY) + "," +
                    (bot.lng() + deltaX) + "," +
                    (top.lat() + deltaY);

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
                        case "srs":
                            break;
                        case "bgcolor":
                            break;
                        case "transparent":
                            break;
                        default:
                            url += kvo[0] + '=' + kvo[1] + '&';
                            break;
                    }
                });
                url += "&BGCOLOR=0xFFFFFF";
                url += "&TRANSPARENT=TRUE";
                url += "&SRS=EPSG:4326"; //set WGS84
                url += "&BBOX=" + bbox; // set bounding box
                url += "&WIDTH=256"; //tile size in google
                url += "&HEIGHT=256";
                /*
                url += "&REQUEST=GetMap"; //WMS operation
                url += "&SERVICE=WMS";    //WMS service
                url += "&VERSION=1.1.1";  //WMS version
                //url += "&LAYERS=" + "typologie,hm2003"; //WMS layers
                url += "&LAYERS=" + "swcb:TaipeiCity"; //WMS layers
                url += "&FORMAT=image/png" ; //WMS format
                url += "&BGCOLOR=0xFFFFFF";
                url += "&TRANSPARENT=TRUE";
                url += "&SRS=EPSG:4326";     //set WGS84
                url += "&BBOX=" + bbox;      // set bounding box
                url += "&WIDTH=256";         //tile size in google
                url += "&HEIGHT=256";
                */
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
        switch(param.mode){
            case "marker":
                if (param.notPanTo != true) {
                    map.panTo(param.geom);
                }

                var _locatemarker = new google.maps.Marker({
                    map: map
                });

                _locatemarker.setPosition(param.geom);

                if(param.title){
                    _locatemarker.setTitle(param.title);
                }
                if(param.icon){
                    _locatemarker.setIcon(param.icon);
                }

                var _locateEvent;
                if (param.click != undefined) {
                    _locateEvent = _locatemarker.addListener('click', param.click);
                    _locatemarker.setClickable(true);
                }
                else {
                    if (param.content) {
                        _locateEvent = _locatemarker.addListener('click', function() {
                            locateInfo.setContent(this.get("content"));
                            locateInfo.open(map, _locatemarker);
                        });
                        _locatemarker.set("content", param.content);
                        _locatemarker.setClickable(true);
                    }
                    else {
                        _locateEvent.remove();
                        _locatemarker.setClickable(false);
                    }
                }

                if(param.callback){
                    param.callback();
                }

                locateMarkers.push(_locatemarker);
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

    map.locateClear = function(){
        locateMarkers.forEach(function(marker){
            marker.setMap(null);
        });
        locateMarkers = [];
        locateInfo.close();

        locateDataLayer.forEach(function(feature) {
            locateDataLayer.remove(feature);
        });
    };
}