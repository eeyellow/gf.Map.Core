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

    // from fusion_extended_map.js
    var MAX_ZOOM_LEVEL = 23;
    var TILE_WIDTH = 256;
    var TILE_HEIGHT = 256;

    /* constructor */
    this.geeFusionLayer = function (index, overlay) {
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
    this.addGEE = function (imgName, geeId, url, storage) {
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
                map.initializeLayers(geeServerDefs, imgName, geeId);
                // map type update
                //updateMapType(map, 'unshift', geeId);
                // set default type
                //map.setMapTypeId(geeId);
            }
        });
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
        this.layerMap[id] = new o.geeFusionLayer(index, overlay);
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
    /*
    map.getMapLayers = function (dom_id) {        
        for (var i = 0; i < geeServerDefs.layers.length; i++) {
            var layer = geeServerDefs.layers[i];
            var layerId = layer.glm_id ?
                layer.glm_id + '-' + layer.id : '0-' + layer.id;
            // geeId
            layerId = this.geeId + '_' + layerId;

            var div = document.getElementById(dom_id);
            if (!div) return false;

            // var checked = layer.initialState ? ' checked' : '';
            var checked = layer.initialState ? '' : '';
            // var disabled = layer.label == 'Imagery' ? ' disabled' : '';
            var disabled = layer.label == 'Imagery' ? '' : '';

            if (layer.label == 'Imagery') layer.label = this.imgName;

            div.innerHTML +=
                '<li><label><input type="checkbox"' +
                'onclick="toggleMapLayer(\'' + layerId + '\')"' +
                'id="' + layerId + '" ' +
                checked + disabled + '/>' + layer.label + '</label></li>';
        }
    };
    */

    /*
    map.toggleMapLayer = function (layerId, selected) {            
        if (selected) {
            if (this.layerMap[layerId]) 
            {
                this.layerMap[layerId].overlay.type = 'layer';
            }
           
            try {
                this.showFusionLayerS(layerId);

                var mt = this.layerMap[layerId].overlay;
                Overlayopacity(mt);
            } catch (ex) {

            }
            
        } 
        else 
        { 
            this.hideFusionLayerS(layerId);            
        }
    }
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
    map.removeWMSLayer = function (id) {
        this.wmsLayer.forEach(function (ele, idx) {
            if (ele == id) {
                var i = map.layerIds.length + idx;
                var o = map.overlayMapTypes.getAt(i);
                if (o && o.id == id) {
                    //map.overlayMapTypes.removeAt(i);
                    map.overlayMapTypes.setAt(i, null);
                }
            }
        });

        this.layerVisible[id] = false;
    };

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
    map.removeKMLLayer = function (id) {
        var kmlLayer = this.kmlLayer[id];
        kmlLayer.setMap(null);
        this.layerVisible[id] = false;
    };

    map.setGeoJsonLayer = function(id, dataLayer){
        if(id != undefined){
            this.geojsonLayer[id] = dataLayer;
        }
    };
    map.removeGeoJsonLayer = function(id){
        if(id != undefined){
            this.geojsonLayer[id] = null;
            delete this.geojsonLayer[id];
        }
    };
    map.getGeoJsonLayer = function(id){
        if(id != undefined){
            return this.geojsonLayer[id];
        }
    };

    map.toggleMapLayer = function (param) {
        var lid = param.mapName + "_" + param.glmId + "-" + param.layerid2d;
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
}