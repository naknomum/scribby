/*
    lets a user draw on an svg element.
    https://github.com/naknomum/scribby

       h/t  https://stackoverflow.com/a/40700068  for the smoothness
*/

class Scribby {
    constructor(svgEl, json) {
        if (typeof(json) != 'object') json = {};
        this.version = '1.1';
        this.dateCreated = json.dateCreated || new Date();
        this.dateModified = json.dateModified || new Date();
        this.svgEl = svgEl;
        this.path = null;
        this.buffer = [];
        this.strPath = null;
        this._undid = [];

        if (json.svg && json.svg.content) svgEl.innerHTML = json.svg.content;

        //these can be changed via methods (below)
        this.bufferSize = json.bufferSize || 8;
        this.attrFill = 'none';
        this.attrStroke = '#000';
        this.attrStrokeWidth = json.strokeWidth || 2;
        this.init();
    }

    init() {
        var me = this;
        this.svgEl.addEventListener('mousedown', this.eventDown.bind(this), false);
        this.svgEl.addEventListener('touchstart', this.eventDown.bind(this), false);
        this.svgEl.addEventListener('mousemove', this.eventMove.bind(this), false);
        this.svgEl.addEventListener('touchmove', this.eventMove.bind(this), false);
        this.svgEl.addEventListener('mouseup', this.eventUp.bind(this), false);
        this.svgEl.addEventListener('touchend', this.eventUp.bind(this), false);
    }

    eventMove(ev) {
        if (this.path) {
            ev.stopPropagation();
            ev.preventDefault();
            this.appendToBuffer(this.getMousePosition(ev));
            this.updateSvgPath();
        }
    }

    eventDown(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        this.path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.path.setAttribute('fill', this.attrFill);
        this.path.setAttribute('stroke', this.attrStroke);
        this.path.setAttribute('stroke-width', this.attrStrokeWidth);
        this.path.setAttribute('stroke-linecap', 'round');
        this.buffer = [];
        var pt = this.getMousePosition(ev);
        this.appendToBuffer(pt);
        this.strPath = "M" + this.nicerDecimal(pt.x) + " " + this.nicerDecimal(pt.y);
        this.path.setAttribute("d", this.strPath);
        this.svgEl.appendChild(this.path);
    }

    eventUp(ev) {
        if (!this.path) return false;
        if (!this.path.getTotalLength()) {  //empty path cuz was just click
            this.svgEl.lastElementChild.remove();
            this.path = null;
            return false;
        }
        this.path = null;
        this.updateModified();
        return true;
    }

    reset() {
        this.svgEl.innerHTML = '';
        this._undid = [];
        this.updateModified();
    }

    //this correlates to "smoothness".  1 is raw/rough, and ~8 is pretty smooth.  >15 or so gets silly & funky!
    setBufferSize(b) {
        if (b < 1) b = 1;
        this.bufferSize = b;
    }

    setAttrFill(f) {
        this.attrFill = f;
    }
    setAttrStroke(s) {
        this.attrStroke = s;
    }
    setAttrStrokeWidth(w) {
        this.attrStrokeWidth = w;
    }


    //these are some utility functions
    getMousePosition(ev) {
        var rect = this.svgEl.getBoundingClientRect();
        if (ev.pageX && ev.pageY) return { x: ev.pageX - rect.left, y: ev.pageY - rect.top };
        if (ev.targetTouches.length) return { x: ev.targetTouches[0].pageX - rect.left, y: ev.targetTouches[0].pageY - rect.top };
        return { x: 0, y: 0 };  //oops?
    }

    appendToBuffer(pt) {
        this.buffer.push(pt);
        while (this.buffer.length > this.bufferSize) {
            this.buffer.shift();
        }
    }

    // Calculate the average point, starting at offset in the buffer
    getAveragePoint(offset) {
        var len = this.buffer.length;
        if (len % 2 === 1 || len >= this.bufferSize) {
            var totalX = 0;
            var totalY = 0;
            var pt, i;
            var count = 0;
            for (i = offset; i < len; i++) {
                count++;
                pt = this.buffer[i];
                totalX += pt.x;
                totalY += pt.y;
            }
            return {
                x: totalX / count,
                y: totalY / count
            }
        }
        return null;
    }

    nicerDecimal(d) {
        return Math.floor(d * 100) / 100;
    }

    undo() {
        if (!this.svgEl.lastElementChild || ((this.svgEl.lastElementChild.nodeName != 'path') && (this.svgEl.lastElementChild.nodeName != 'text'))) return false;
        this._undid.push(this.svgEl.lastElementChild.cloneNode(true));
        this.svgEl.lastElementChild.remove();
        return true;
    }
    redo() {
        if (!this._undid.length) return false;
        this.svgEl.appendChild(this._undid.pop());
        return true;
    }

    // might be of some interest for later -- https://mourner.github.io/simplify-js/

    updateSvgPath() {
        var pt = this.getAveragePoint(0);
        if (pt) {
            // Get the smoothed part of the path that will not change
            this.strPath += " L" + this.nicerDecimal(pt.x) + " " + this.nicerDecimal(pt.y);
            // Get the last part of the path (close to the current mouse position)
            // This part will change if the mouse moves again
            var tmpPath = "";
            for (var offset = 2; offset < this.buffer.length; offset += 2) {
                pt = this.getAveragePoint(offset);
                tmpPath += " L" + this.nicerDecimal(pt.x) + " " + this.nicerDecimal(pt.y);
            }
            // Set the complete current path coordinates
            this.path.setAttribute("d", this.strPath + tmpPath);
        }
    }

    toJson() {
        return {
            version: this.version,
            about: 'https://github.com/naknomum/scribby',
            dateCreated: this.dateCreated,
            dateModified: this.dateModified,
            svg: {
                width: this.svgEl.clientWidth,
                height: this.svgEl.clientHeight,
                content: this.svgEl.innerHTML
            },
            strokeWidth: this.attrStrokeWidth,
            bufferSize: this.bufferSize
        };
    }

    toCanvas(canv, callback) {
        this.svgEl.setAttribute('width', this.svgEl.clientWidth);  //firefox needs these to not be % for drawImage
        this.svgEl.setAttribute('height', this.svgEl.clientHeight);
        if (!canv) {
            canv = document.createElement('canvas');
            canv.height = this.svgEl.clientHeight;
            canv.width = this.svgEl.clientWidth;
        }
        var ctx = canv.getContext('2d');
        var svgURL = new XMLSerializer().serializeToString(this.svgEl);
        var img  = new Image();
        img.onload = function() {
            ctx.drawImage(this, 0,0);
            if (callback) callback(ctx);  //e.g. access ctx.canvas.toDataURL()
        };
        img.src = 'data:image/svg+xml;base64, ' + window.btoa(svgURL);
        this.svgEl.setAttribute('width', '100%');  //returning these for completeness... just in case?
        this.svgEl.setAttribute('height', '100%');
        return canv;
    }

    updateModified() {
        this.dateModified = new Date();
        this.svgEl.dispatchEvent(new Event('scribby.modified'));
    }
}


