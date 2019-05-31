gf.Map.Core.js
===========

**Google Map API with GEE 2D Map Resource** 


How to Use
--------

```js
/* 1 : Create Google Map Instance */
mapInstance = new google.maps.Map(document.getElementById('map'), {
    center: {lat: -34.397, lng: 150.644},
    zoom: 8
});
/* 2 : Extend Map Instance with GEE function  */
var geemap = new GEEMap(mapInstance);

/* 3: Link GEE 2D Map Resource */
mapInstance.addGEE(imageryName, mapName, geeResourceUrl, mapDef);
```

Settings Example
--------
```js
var imageryName = "福衛";
var mapName = "SWCB";
var geeResourceUrl = "http://geeserver.swcb.gov.tw/SWCB_2D/";
var mapDef = {};
```

Documentation
-------------


Compatibility
-------------
* Chrome 54 or above.

* Firefox 49 or above

* Safari 10 or above

* IE 11

* Edge 14 or above


License
-------------
* [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0.html)