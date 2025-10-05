/*! For license information please see svg-inject.js.LICENSE.txt */
( () => {
    var e = {
        7187: (e, t, n) => {
            function r(e) {
                return r = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(e) {
                    return typeof e
                }
                : function(e) {
                    return e && "function" == typeof Symbol && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e
                }
                ,
                r(e)
            }
            e = n.nmd(e),
            function(t, n) {
                var i, o, a = "style", f = "title", u = "undefined", c = null, l = "--inject-", s = new RegExp("--inject-\\d+","g"), d = "LOAD_FAIL", v = "SVG_INVALID", m = ["src", "alt", "onload", "onerror"], p = n.createElement("a"), h = ("undefined" == typeof SVGRect ? "undefined" : r(SVGRect)) != u, g = {
                    useCache: !0,
                    copyAttributes: !0,
                    makeIdsUnique: !0
                }, y = {
                    clipPath: ["clip-path"],
                    "color-profile": c,
                    cursor: c,
                    filter: c,
                    linearGradient: ["fill", "stroke"],
                    marker: ["marker", "marker-end", "marker-mid", "marker-start"],
                    mask: c,
                    pattern: ["fill", "stroke"],
                    radialGradient: ["fill", "stroke"]
                }, b = 1;
                function A(e) {
                    return (i = i || new XMLSerializer).serializeToString(e)
                }
                function E(e, t) {
                    var n, r, i, o, f = l + b++, u = /url\("?#([a-zA-Z][\w:.-]*)"?\)/g, s = e.querySelectorAll("[id]"), d = t ? [] : c, v = {}, m = [], p = !1;
                    if (s.length) {
                        for (i = 0; i < s.length; i++)
                            (r = s[i].localName)in y && (v[r] = 1);
                        for (r in v)
                            (y[r] || [r]).forEach((function(e) {
                                m.indexOf(e) < 0 && m.push(e)
                            }
                            ));
                        m.length && m.push(a);
                        var h, g, A, E = e.getElementsByTagName("*"), S = e;
                        for (i = -1; S != c; ) {
                            if (S.localName == a)
                                (A = (g = S.textContent) && g.replace(u, (function(e, t) {
                                    return d && (d[t] = 1),
                                    "url(#" + t + f + ")"
                                }
                                ))) !== g && (S.textContent = A);
                            else if (S.hasAttributes()) {
                                for (o = 0; o < m.length; o++)
                                    h = m[o],
                                    (A = (g = S.getAttribute(h)) && g.replace(u, (function(e, t) {
                                        return d && (d[t] = 1),
                                        "url(#" + t + f + ")"
                                    }
                                    ))) !== g && S.setAttribute(h, A);
                                ["xlink:href", "href"].forEach((function(e) {
                                    var t = S.getAttribute(e);
                                    /^\s*#/.test(t) && (t = t.trim(),
                                    S.setAttribute(e, t + f),
                                    d && (d[t.substring(1)] = 1))
                                }
                                ))
                            }
                            S = E[++i]
                        }
                        for (i = 0; i < s.length; i++)
                            n = s[i],
                            d && !d[n.id] || (n.id += f,
                            p = !0)
                    }
                    return p
                }
                function S(e, t, r, i) {
                    if (t) {
                        t.setAttribute("data-inject-url", r);
                        var o = e.parentNode;
                        if (o) {
                            i.copyAttributes && function(e, t) {
                                for (var r, i, o, a = e.attributes, u = 0; u < a.length; u++)
                                    if (i = (r = a[u]).name,
                                    -1 == m.indexOf(i))
                                        if (o = r.value,
                                        i == f) {
                                            var c, l = t.firstElementChild;
                                            l && l.localName.toLowerCase() == f ? c = l : (c = n.createElementNS("http://www.w3.org/2000/svg", f),
                                            t.insertBefore(c, l)),
                                            c.textContent = o
                                        } else
                                            t.setAttribute(i, o)
                            }(e, t);
                            var a = i.beforeInject
                              , u = a && a(e, t) || t;
                            o.replaceChild(u, e),
                            e.__svgInject = 1,
                            k(e);
                            var c = i.afterInject;
                            c && c(e, u)
                        }
                    } else
                        _(e, i)
                }
                function x() {
                    for (var e = {}, t = arguments, n = 0; n < t.length; n++) {
                        var r = t[n];
                        for (var i in r)
                            r.hasOwnProperty(i) && (e[i] = r[i])
                    }
                    return e
                }
                function j(e, t) {
                    if (t) {
                        var r;
                        try {
                            r = function(e) {
                                return (o = o || new DOMParser).parseFromString(e, "text/xml")
                            }(e)
                        } catch (e) {
                            return c
                        }
                        return r.getElementsByTagName("parsererror").length ? c : r.documentElement
                    }
                    var i = n.createElement("div");
                    return i.innerHTML = e,
                    i.firstElementChild
                }
                function k(e) {
                    e.removeAttribute("onload")
                }
                function w(e) {
                    console.error("SVGInject: " + e)
                }
                function I(e, t, n) {
                    e.__svgInject = 2,
                    n.onFail ? n.onFail(e, t) : w(t)
                }
                function _(e, t) {
                    k(e),
                    I(e, v, t)
                }
                function C(e, t) {
                    k(e),
                    I(e, "SVG_NOT_SUPPORTED", t)
                }
                function N(e, t) {
                    I(e, d, t)
                }
                function G(e) {
                    e.onload = c,
                    e.onerror = c
                }
                function L(e) {
                    w("no img element")
                }
                var T = function e(i, o) {
                    var f = x(g, o)
                      , m = {};
                    function y(e, t) {
                        t = x(f, t);
                        var n = function(n) {
                            var i = function() {
                                var e = t.onAllFinish;
                                e && e(),
                                n && n()
                            };
                            if (e && r(e.length) != u) {
                                var o = 0
                                  , a = e.length;
                                if (0 == a)
                                    i();
                                else
                                    for (var f = function() {
                                        ++o == a && i()
                                    }, c = 0; c < a; c++)
                                        w(e[c], t, f)
                            } else
                                w(e, t, i)
                        };
                        return ("undefined" == typeof Promise ? "undefined" : r(Promise)) == u ? n() : new Promise(n)
                    }
                    function w(e, t, n) {
                        if (e) {
                            var i = e.__svgInject;
                            if (i)
                                Array.isArray(i) ? i.push(n) : n();
                            else {
                                if (G(e),
                                !h)
                                    return C(e, t),
                                    void n();
                                var o = t.beforeLoad
                                  , a = o && o(e) || e.getAttribute("src");
                                if (!a)
                                    return "" === a && N(e, t),
                                    void n();
                                var f = [];
                                e.__svgInject = f;
                                var g = function() {
                                    n(),
                                    f.forEach((function(e) {
                                        e()
                                    }
                                    ))
                                }
                                  , y = (O = a,
                                p.href = O,
                                p.href)
                                  , x = t.useCache
                                  , k = t.makeIdsUnique
                                  , w = function(e) {
                                    x && (m[y].forEach((function(t) {
                                        t(e)
                                    }
                                    )),
                                    m[y] = e)
                                };
                                if (x) {
                                    var I, T = function(n) {
                                        if (n === d)
                                            N(e, t);
                                        else if (n === v)
                                            _(e, t);
                                        else {
                                            var r, i = n[0], o = n[1], a = n[2];
                                            k && (i === c ? (i = E(r = j(o, !1), !1),
                                            n[0] = i,
                                            n[2] = i && A(r)) : i && (o = function(e) {
                                                return e.replace(s, l + b++)
                                            }(a))),
                                            r = r || j(o, !1),
                                            S(e, r, y, t)
                                        }
                                        g()
                                    };
                                    if (r(I = m[y]) != u)
                                        return void (I.isCallbackQueue ? I.push(T) : T(I));
                                    (I = []).isCallbackQueue = !0,
                                    m[y] = I
                                }
                                !function(e, t, n) {
                                    if (e) {
                                        var r = new XMLHttpRequest;
                                        r.onreadystatechange = function() {
                                            if (4 == r.readyState) {
                                                var e = r.status;
                                                200 == e ? t(r.responseXML, r.responseText.trim()) : (e >= 400 || 0 == e) && n()
                                            }
                                        }
                                        ,
                                        r.open("GET", e, !0),
                                        r.send()
                                    }
                                }(y, (function(n, r) {
                                    var i = n instanceof Document ? n.documentElement : j(r, !0)
                                      , o = t.afterLoad;
                                    if (o) {
                                        var a = o(i, r) || i;
                                        if (a) {
                                            var f = "string" == typeof a;
                                            r = f ? a : A(i),
                                            i = f ? j(a, !0) : a
                                        }
                                    }
                                    if (i instanceof SVGElement) {
                                        var u = c;
                                        if (k && (u = E(i, !1)),
                                        x) {
                                            var l = u && A(i);
                                            w([u, r, l])
                                        }
                                        S(e, i, y, t)
                                    } else
                                        _(e, t),
                                        w(v);
                                    g()
                                }
                                ), (function() {
                                    N(e, t),
                                    w(d),
                                    g()
                                }
                                ))
                            }
                        } else
                            L();
                        var O
                    }
                    return h && function(e) {
                        var t = n.getElementsByTagName("head")[0];
                        if (t) {
                            var r = n.createElement(a);
                            r.type = "text/css",
                            r.appendChild(n.createTextNode(e)),
                            t.appendChild(r)
                        }
                    }('img[onload^="' + i + '("]{visibility:hidden;}'),
                    y.setOptions = function(e) {
                        f = x(f, e)
                    }
                    ,
                    y.create = e,
                    y.err = function(e, t) {
                        e ? 2 != e.__svgInject && (G(e),
                        h ? (k(e),
                        N(e, f)) : C(e, f),
                        t && (k(e),
                        e.src = t)) : L()
                    }
                    ,
                    t[i] = y,
                    y
                }("SVGInject");
                "object" == r(e) && "object" == r(e.exports) && (e.exports = T)
            }(window, document)
        }
    }
      , t = {};
    function n(r) {
        var i = t[r];
        if (void 0 !== i)
            return i.exports;
        var o = t[r] = {
            id: r,
            loaded: !1,
            exports: {}
        };
        return e[r](o, o.exports, n),
        o.loaded = !0,
        o.exports
    }
    n.nmd = e => (e.paths = [],
    e.children || (e.children = []),
    e);
    n(7187)
}
)();
