import assert from 'node:assert/strict';
import {chartPoints,chartIndex}from'../src/Pages/Trade/chartPoints.js';
const points=chartPoints([{close:'10.12345678',time:1000},{close:'NaN'},{close:0},{close:'20.00000001',time:2000}]);
assert.equal(points.length,2);assert.equal(points[0].price,'10.12345678');assert.equal(points[1].price,'20.00000001');
assert.equal(points[0].x,0);assert.equal(points[1].x,1000);assert.equal(points[0].y,250);assert.equal(points[1].y,40);
assert.deepEqual(chartPoints([]),[]);assert.deepEqual(chartPoints([{close:'1'}]),[]);
assert.equal(chartIndex(-10,0,100,3),0);assert.equal(chartIndex(50,0,100,3),1);assert.equal(chartIndex(500,0,100,3),2);
assert.equal(chartIndex(10,0,0,3),null);assert.equal(chartIndex(10,0,100,0),null);
console.log('PASS chart coordinates, edge clicks, invalid data and exact selected-price strings');
