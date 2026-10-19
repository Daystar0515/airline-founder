// LZ 壓縮（演算法依 lz-string 1.4.4，Pieroxy，MIT 授權；此為精簡改寫，只保留 UTF-16 版本）。
// 存檔 JSON 壓縮後大約只剩 1/6～1/10，讓瀏覽器的儲存空間可以放好幾個存檔。
(function () {
  const G = (window.G = window.G || {});
  const f = String.fromCharCode;
  function compress(input, bitsPerChar, getChar) {
    if (input == null) return '';
    const dict = new Map(), toCreate = new Set();
    let w = '', enlargeIn = 2, dictSize = 3, numBits = 2, val = 0, pos = 0;
    const out = [];
    const put = (bit) => {
      val = (val << 1) | bit;
      if (pos === bitsPerChar - 1) { pos = 0; out.push(getChar(val)); val = 0; } else pos++;
    };
    const putBits = (v, n) => { for (let i = 0; i < n; i++) { put(v & 1); v >>= 1; } };
    const emit = (w) => {
      if (toCreate.has(w)) {
        const c = w.charCodeAt(0);
        if (c < 256) { putBits(0, numBits); putBits(c, 8); } else { putBits(1, numBits); putBits(c, 16); }
        if (--enlargeIn === 0) { enlargeIn = 1 << numBits; numBits++; }
        toCreate.delete(w);
      } else putBits(dict.get(w), numBits);
      if (--enlargeIn === 0) { enlargeIn = 1 << numBits; numBits++; }
    };
    for (let i = 0; i < input.length; i++) {
      const c = input.charAt(i);
      if (!dict.has(c)) { dict.set(c, dictSize++); toCreate.add(c); }
      const wc = w + c;
      if (dict.has(wc)) w = wc;
      else { emit(w); dict.set(wc, dictSize++); w = c; }
    }
    if (w !== '') emit(w);
    putBits(2, numBits);
    for (;;) { val <<= 1; if (pos === bitsPerChar - 1) { out.push(getChar(val)); break; } pos++; }
    return out.join('');
  }
  function decompress(length, resetValue, getNext) {
    const dict = [0, 1, 2];
    let enlargeIn = 4, dictSize = 4, numBits = 3, entry = '', w, c;
    const result = [];
    const data = { val: getNext(0), position: resetValue, index: 1 };
    const read = (n) => {
      let bits = 0, power = 1;
      const max = 1 << n;
      while (power !== max) {
        const resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) { data.position = resetValue; data.val = getNext(data.index++); }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      return bits;
    };
    switch (read(2)) {
      case 0: c = f(read(8)); break;
      case 1: c = f(read(16)); break;
      case 2: return '';
    }
    dict[3] = c; w = c; result.push(c);
    for (;;) {
      if (data.index > length) return '';
      let cc = read(numBits);
      switch (cc) {
        case 0: dict[dictSize++] = f(read(8)); cc = dictSize - 1; enlargeIn--; break;
        case 1: dict[dictSize++] = f(read(16)); cc = dictSize - 1; enlargeIn--; break;
        case 2: return result.join('');
      }
      if (enlargeIn === 0) { enlargeIn = 1 << numBits; numBits++; }
      if (dict[cc]) entry = dict[cc];
      else if (cc === dictSize) entry = w + w.charAt(0);
      else return null;
      result.push(entry);
      dict[dictSize++] = w + entry.charAt(0);
      enlargeIn--;
      w = entry;
      if (enlargeIn === 0) { enlargeIn = 1 << numBits; numBits++; }
    }
  }
  G.lz = {
    // 每個字元 15 位元，避開不合法的 UTF-16 代理字元，可以安全放進 localStorage
    pack: (s) => compress(s, 15, (a) => f(a + 32)) + ' ',
    unpack: (s) => (s == null ? '' : s === '' ? null : decompress(s.length, 16384, (i) => s.charCodeAt(i) - 32)),
  };
})();
