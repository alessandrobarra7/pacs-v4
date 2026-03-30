// ESM shim for 'seedrandom' CJS package
// vtk.js imports: import seedrandom from 'seedrandom'
// Minimal implementation that provides the same interface

// Simple seeded PRNG (Alea algorithm)
function mash() {
  var n = 0xefc8249d;
  return function(data) {
    data = data.toString();
    for (var i = 0; i < data.length; i++) {
      n += data.charCodeAt(i);
      var h = 0.02519603282416938 * n;
      n = h >>> 0;
      h -= n;
      h *= n;
      n = h >>> 0;
      h -= n;
      n += h * 0x100000000;
    }
    return (n >>> 0) * 2.3283064365386963e-10;
  };
}

function alea(seed) {
  var m = mash();
  var s0 = m(' ');
  var s1 = m(' ');
  var s2 = m(' ');
  var c = 1;
  if (seed !== undefined) {
    s0 -= m(seed);
    if (s0 < 0) s0 += 1;
    s1 -= m(seed);
    if (s1 < 0) s1 += 1;
    s2 -= m(seed);
    if (s2 < 0) s2 += 1;
  }
  var random = function() {
    var t = 2091639 * s0 + c * 2.3283064365386963e-10;
    s0 = s1;
    s1 = s2;
    return s2 = t - (c = t | 0);
  };
  random.uint32 = function() { return random() * 0x100000000; };
  random.fract53 = function() { return random() + (random() * 0x200000 | 0) * 1.1102230246251565e-16; };
  random.version = 'Alea 0.9';
  random.args = [seed];
  return random;
}

function seedrandom(seed, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  var rng = alea(seed !== undefined ? seed : Math.random());
  if (callback) return callback(rng);
  return rng;
}

export default seedrandom;
