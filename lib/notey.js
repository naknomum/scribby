
class Notey {

    static pageKey = null;  //set for unique per-page localStorage
    static mouseIsOver = null;
    static mouseEvent = null;

/*
    remoteUrl json rest POST is experimental(?)  have only tested with
        remoteUrl = 'https://jsonblob.com/api/jsonBlob'
    but this has been successful!
*/
    static remoteUrl = null;
    static autoSyncMillis = 5 * 60 * 1000;  //tweak this to change how often will auto-sync remotely
    static autoSyncCount = 10;  //remote syncs ever N saves

    static allNoteys = {};
    static colorChoices = [
        'rgba(1,1,1,0)',
        '#FE8',
        '#FAA',
        '#4F8',
        '#34F',
        '#FDFDFD',
    ];
    static shiftDown = null;

    constructor(json) {
        if (typeof(json) != 'object') json = {};
        this.version = '1.2';  //TODO could check against json.version ??
        this.readOnly = json.readOnly || false;
        this.storeLocal = true;
        this.wobbly = false;  //causes slight tilt (rotation) when dragged ... broken for now!  :(   FIXME
        this.el = null;
        this.id = json.id || Notey.uuidv4();
        this.remoteId = json.remoteId || null;
        this.dateCreated = (json.dateCreated && new Date(json.dateCreated)) || new Date();
        this.dateModified = (json.dateModified && new Date(json.dateModified)) || new Date();
        this.dateSaved = (json.dateSaved && new Date(json.dateSaved)) || null;
        this.dateSynced = (json.dateSynced && new Date(json.dateSynced)) || null;
        this._saveCount = 0;
        this._keyX = -1;
        this._keyY = -1;
        this.noDrag = json.noDrag;  //will not drag if true
        this.noText = json.noText;  //disallow typing text within note

        this.el = document.createElement('div');
        this.el.id = this.id;
        this.el.classList.add('draggy');
        this.el.classList.add('draggy-new');

        this.bgColorId = (json.bgColorId == undefined) ? 1 : json.bgColorId;
        this.strokeColorId = json.strokeColorId || 0;
        this.el.style.left = (json.x || Math.floor(Math.random() * 80) + 20) + 'px';
        this.el.style.top = (json.y || Math.floor(Math.random() * 80) + 20) + 'px';
        this.el.style.width = (json.width || 200) + 'px';
        this.el.style.height = (json.height || 200) + 'px';
        this.el.style.backgroundColor = Notey.colorChoices[this.bgColorId];
        this.init();
        this.scribby = new Scribby(this.svg, json.scribby);
        if (this.readOnly) this.svg.style.pointerEvents = 'none';
        if (this.strokeColorId != 0) this.scribby.setAttrStroke(Notey.colorChoices[this.strokeColorId]);
        Notey.allNoteys[this.id] = this;
        return this;
    }

    init() {
        this.initStyles();
        var me = this;
        this.canvas = document.createElement('canvas');
        if (this.wobbly) this.el.style.transform = 'rotate(' + (8 - Math.random() * 16) + 'deg)';

        this.dragbar = document.createElement('div');
        this.dragbar.id = this.id + '-dragbar';
        this.dragbar.classList.add('dragbar');
        var cbg = (this.strokeColorId == 0) ? '' : ' style="background-color: ' + Notey.colorChoices[this.strokeColorId] + '" ';
        var h = '<div class="dragbar-button dragbar-close" onClick="Notey.dragbarClick(this)"></div>';
        h += '<div class="dragbar-button dragbar-reset" onClick="Notey.dragbarClick(this)"></div>';
        h += '<div class="dragbar-button dragbar-undo" title="shift=redo" onClick="Notey.dragbarClick(this)"></div>';
        h += '<div ' + cbg + ' id="dragbar-button-color-' + this.id + '" class="dragbar-button dragbar-color" onClick="Notey.dragbarClick(this)"></div>';
        h += '<div class="dragbar-button dragbar-download" title="svg (shift=png)" onClick="Notey.dragbarClick(this)"></div>';
        h += '<div class="dragbar-button dragbar-share" onClick="Notey.dragbarClick(this)"></div>';
        h += '</div>';
        this.dragbar.innerHTML = h;
        this.el.appendChild(this.dragbar);

        var tmp = document.createElement('template');  //what madness is this
        tmp.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="100%" height="100%" id="' + this.id + '-svg" ></svg>';
        this.svg = tmp.content.firstChild;
        this.svg.style.userSelect = 'none';  //prevents selecting of text while drawing
        this.el.appendChild(this.svg);

        if (!this.noDrag) {
            new Draggy(this.el, this.dragbar);
            this.el.addEventListener('draggy.moved', function() {
                me.updateModified();
            }, false);
        }

        this.svg.addEventListener('mousedown', function() {
            me.dragbar.style.width = 0;
        }, false);
        this.svg.addEventListener('mouseup', function() {
            me.dragbar.style.width = '100%';
        }, false);
        this.svg.addEventListener('mouseover', function() {
            Notey.mouseIsOver = me;
        }, false);
        this.svg.addEventListener('mouseout', function() {
            Notey.mouseIsOver = null;
        }, false);
        this.svg.addEventListener('scribby.modified', function() {
            me.updateModified();
        }, false);

        this.dragbar.addEventListener('mousedown', function(ev) {
            me.el.classList.remove('draggy-new');
            if (!me.wobbly) return;
            var w = me.dragbar.clientWidth - 55;  //minus the button part
            if (!w || w < 1) return;
            //offset will be approx between 0-1, + on left and - on right, 0 is near center, 1 is out toward edge
            var offset = (w / 2 - ev.offsetX) * 2;
            var deg = 15 * offset / w;
            me.el.style.transform = 'rotate(' + deg + 'deg)';
        }, false);

        if (Notey.shiftDown === null) {
            Notey.shiftDown = false;
            document.addEventListener('mousemove', function(ev) {
                if (Notey._needTextSave) {
                    var n = Notey._needTextSave;
                    if (n.svg.lastElementChild.getNumberOfChars()) {
                        Notey._needTextSave = false;
                        n.save();
                    } else {
                        Notey._needTextSave = false;
                        n.svg.lastElementChild.remove();
                    }
                }
                Notey.mouseEvent = ev;
            });
            if (!this.noText) document.addEventListener('keyup', function(ev) {
                if (!Notey.mouseIsOver) return;
                Notey.mouseIsOver.keyPress(ev);
            });
            document.addEventListener('keydown', function(ev) {
                if (ev.keyCode == 16) Notey.shiftDown = true;
            }, false);
            document.addEventListener('keyup', function(ev) {
                if (ev.keyCode == 16) Notey.shiftDown = false;
            }, false);
        }
    }

    initStyles() {
        var st = document.createElement('style');
        st.innerHTML = '.draggy { position: absolute; }';
        st.innerHTML += '.draggy svg { cursor: crosshair; }';
        st.innerHTML += '.dragging { opacity: 0.6; }';
        st.innerHTML += '.dragbar { overflow: hidden; position: absolute; width: 100%; background-color: rgba(0,0,0,0.1); display: none; height: 30px; cursor: grab; }';
        st.innerHTML += '.draggy:hover { 1px 1px 2px 2px rgba(0,0,0,0.2); }';
        st.innerHTML += '.draggy:hover .dragbar { display: block; }';
        st.innerHTML += '.drag-down .dragbar, .dragging .dragbar { cursor: grabbing; }';
        st.innerHTML += '.dragbar-button { width: 24px; height: 24px; background-color: #888; margin: 3px 2px; cursor: pointer; border-radius: 3px; ';
        st.innerHTML += 'float: right; } .dragbar-button:hover { background-color: #666; }';
        st.innerHTML += '.dragbar-close { background-image: url("' +
            Notey.makeDataUrl('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0V0z" fill="none"/><path fill="#eec" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>') + '"); }';
        st.innerHTML += '.dragbar-color { background-image: url("' +
            Notey.makeDataUrl('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0V0z" fill="none"/><path fill="#eec" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>') + '"); }';
        st.innerHTML += '.dragbar-reset { background-image: url("' +
            Notey.makeDataUrl('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0V0z" fill="none"/><path fill="#eec" d="M14 2H4v20h16V8l-6-6zm-2 16c-2.05 0-3.81-1.24-4.58-3h1.71c.63.9 1.68 1.5 2.87 1.5 1.93 0 3.5-1.57 3.5-3.5S13.93 9.5 12 9.5c-1.35 0-2.52.78-3.1 1.9l1.6 1.6h-4V9l1.3 1.3C8.69 8.92 10.23 8 12 8c2.76 0 5 2.24 5 5s-2.24 5-5 5z"/></svg>') + '"); }';
        st.innerHTML += '.dragbar-undo { background-image: url("' +
            Notey.makeDataUrl('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0V0z" fill="none"/><path fill="#eec" d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>') + '"); }';
        st.innerHTML += '.dragbar-share { background-image: url("' +
            Notey.makeDataUrl('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0V0z" fill="none"/><path fill="#eec" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>') + '"); }';
        st.innerHTML += '.dragbar-download { background-image: url("' +
            Notey.makeDataUrl('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0V0z" fill="none"/><path fill="#eec" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>') + '"); }';
        document.head.appendChild(st);
    }

    static makeDataUrl(mimeType, content) {
        return 'data:' + mimeType + ';base64,' + window.btoa(content);
    }

    attachToBody() {
        document.getElementsByTagName('body')[0].appendChild(this.el);
    }

    updateCanvas(callback) {
        this.canvas.width = this.svg.clientWidth;
        this.canvas.height = this.svg.clientHeight;
        this.scribby.toCanvas(this.canvas, function(ctx) { callback(ctx); });
        this.updateModified();
    }

    updateModified() {
        this.dateModified = new Date();
        this.el.dispatchEvent(new Event('notey.modified'));
        this.save();
    }

    getPngDataURL(callback) {
        this.updateCanvas(function(ctx) { callback(ctx.canvas.toDataURL()); });
    }

    localStorageKey() {
        return Notey.localStorageKey(this.id);
    }

    static localStorageKeyPrefix() {
        if (Notey.pageKey) return 'notey:' + Notey.pageKey + ':';
        return 'notey:';
    }
    static localStorageKey(id) {
        return Notey.localStorageKeyPrefix() + id;
    }

    undo() {
        if (!this.scribby.undo()) return;
        this.updateModified();
    }
    redo() {
        if (!this.scribby.redo()) return;
        this.updateModified();
    }
    save(noSync) {
        if (this.readOnly) return;
        Notey._needTextSave = false;
        this.dateSaved = new Date();
        if (!this.storeLocal) return;
        console.info('%s saved at %s', this.id, new Date());
        window.localStorage.setItem(this.localStorageKey(), JSON.stringify(this.toJson()));
        this.el.dispatchEvent(new Event('notey.saved'));
        if (noSync) return;
        this._saveCount++;
        if (!this.dateSynced || ((new Date() - this.dateSynced) > Notey.autoSyncMillis) || (this._saveCount > Notey.autoSyncCount)) {
            if (this.sync()) {
                console.info('%s auto-synced! at %s', this.id, new Date());
            }
            this._saveCount = 0;
        }
    }

    delete() {
        this.remoteDelete();
        if (this.el) {
            this.el.dispatchEvent(new Event('notey.deleted'));  //kinda hack, as it happens *before* we actually kill off this element!
            if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
        }
        if (this.readOnly) return;
        if (this.storeLocal) window.localStorage.removeItem(this.localStorageKey());
        //TODO other stuff here on the object itself!
        delete(Notey.allNoteys[this.id]);
        //unfortunately no way to destroy this in memory cuz we still have reference; so caller must do that!  :(
    }

    // this is tailored to jsonblob api! (e.g. PUT vs POST)    TODO generalize
    sync() {
        if (!Notey.remoteUrl || this.readOnly) return false;
        var method = 'POST';
        var url = Notey.remoteUrl;
        if (this.remoteId) {  //if it has already been stored (has id) then we PUT
            method = 'PUT';
            url = this.remoteId;
        }
        var _prev = this.dateSynced;
        this.dateSynced = new Date();

        var me = this;
        Resty.any(url, method, this.toJson())
        .then(function(response) {
            var rid = response.headers.get('location');
            if (rid) {  //should we check me.remoteId first to block overwrite??
                me.remoteId = rid;
                me.el.dispatchEvent(new Event('notey.syncNew'));
                console.info('%s stored remotely (new) as %s', me.id, rid);
            }
            me.save(true);  //we use noSync=true, so we dont get in a sync-loop! ( as it calls .save() )
            me.el.dispatchEvent(new Event('notey.synced'));
        })
        .catch(function(error) {
            me.dateSynced = _prev;
            console.error(error);
        });
        return true;
    }

    static remoteLoad(id) {
        if (!Notey.remoteUrl || this.readOnly) return Promise.reject(new Error('no remote access'));
        if (!id) return Promise.reject(new Error('invalid id'));
        return Resty.get(Notey.remoteUrl + '/' + id);
    }

    remoteDelete() {
        if (!this.remoteId || this.readOnly) return;
        console.warn('remoteDelete() on %s', this.id);
        this.el.dispatchEvent(new Event('notey.remoteDeleted'));  //doing pre-rest cuz this.el will go away very soon!
        Resty.delete(this.remoteId)
        .then(response => console.info('remote DELETE returned %s (%s)', response.status, response.statusText))
        .catch(error => console.error('remote DELETE error %o', error));
    }

    //handles typing text at cursor into svg
    keyPress(ev) {
        if (!Notey.mouseEvent) return;
        ev.stopPropagation();
        if ((this._keyX != Notey.mouseEvent.offsetX) || (this._keyY != Notey.mouseEvent.offsetY)) {
            this._keyX = Notey.mouseEvent.offsetX;
            this._keyY = Notey.mouseEvent.offsetY;
            this._keyText = '';
            if (ev.keyCode > 31) this._keyText = ev.key;
        } else if ((ev.keyCode > 31) && (this._keyText != undefined)) {
            this._keyText += ev.key;
        } else if ((ev.keyCode == 8) && (this._keyText.length > 0)) {
            this._keyText = this._keyText.substring(0, this._keyText.length - 1);
        } else {
            return;
        }
        if (this._keyText == undefined) return;
//console.log('%d (%d,%d) %s', ev.keyCode, this._keyX, this._keyY, this._keyText);
        var tid = 'text-' + this._keyX + '-' + this._keyY;
        var tel = this.svg.getElementById(tid);
        if (!tel) {
            tel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tel.id = tid;
            tel.setAttribute('class', 'notey-svg-text');
            tel.setAttribute('fill', (this.strokeColorId ? Notey.colorChoices[this.strokeColorId] : '#000'));
            tel.setAttribute('x', this._keyX);
            tel.setAttribute('y', this._keyY);
            this.svg.appendChild(tel);
        }
        Notey._needTextSave = this;
        tel.innerHTML = this._keyText;
    }

    static loadJson(id) {
        var str = window.localStorage.getItem(Notey.localStorageKey(id));
        if (!str) return null;
        var json;
        try { json = JSON.parse(str) }
        catch (ex) {
            console.error('Notey.loadJson() could not parse: %s ==> %o', str, ex);
            return null;
        }
        return json;
    }

    static getSavedIds() {
        var ids = [];
        if (window.localStorage.length < 0) return ids;
        for (var i = 0 ; i < window.localStorage.length ; i++) {
            var k = window.localStorage.key(i);
            if (k.startsWith(Notey.localStorageKeyPrefix())) ids.push(k.substring(Notey.localStorageKeyPrefix().length));
        }
        return ids;
    }

    static loadAll() {
        var rtn = [];
        var ids = Notey.getSavedIds();
        if (ids.length < 1) return rtn;
        for (var i = 0 ; i < ids.length ; i++) {
            if (Notey.getById(ids[i])) continue;  //already loaded
            console.info(ids[i]);
            var json = Notey.loadJson(ids[i]);
            if (!json) continue;  //snh
            rtn.push(new Notey(json));
        }
        return rtn;
    }

    toggleColor() {
        if (Notey.shiftDown) {
            this.strokeColorId = (this.strokeColorId + 1) % Notey.colorChoices.length;
            var c = Notey.colorChoices[this.strokeColorId];
            if (this.strokeColorId == 0) c = '#000';
            this.scribby.setAttrStroke(c);
            document.getElementById('dragbar-button-color-' + this.id).style.backgroundColor = c;
        } else {
            this.bgColorId = (this.bgColorId + 1) % Notey.colorChoices.length;
            this.el.style.backgroundColor = Notey.colorChoices[this.bgColorId];
        }
    }

    toJson() {
        var rect = this.el.getBoundingClientRect();
        return {
            id: this.id,
            remoteId: this.remoteId,
            version: this.version,
            dateCreated: this.dateCreated,
            dateModified: this.dateModified,
            dateSaved: this.dateSaved,
            dateSynced: this.dateSynced,
            bgColorId: this.bgColorId,
            bgColor: Notey.colorChoices[this.bgColorId],
            strokeColorId: this.strokeColorId,
            strokeColor: (this.strokeColorId == 0 ? '#000' : Notey.colorChoices[this.strokeColorId]),
            width: this.el.clientWidth,
            height: this.el.clientHeight,
            x: rect.x,
            y: rect.y,
            noDrag: this.noDrag,
            noText: this.noText,
            scribby: this.scribby.toJson()
        };
    }

    static getById(id) {
        return Notey.allNoteys[id];
    }

    static fromEl(el) {
        if (!el || !el.id) return;
        return Notey.getById(el.id);
    }

    static dragbarClick(buttonEl) {
        event.preventDefault();
        var nEl = buttonEl.parentNode.parentNode;
        var note = Notey.getById(nEl.id);
        if (!note) return;
        if (buttonEl.classList.contains('dragbar-reset')) {
            note.scribby.reset();
            //note.updateModified();  //this will be triggered by event on scribby
        } else if (buttonEl.classList.contains('dragbar-close')) {
            note.delete();
        } else if (buttonEl.classList.contains('dragbar-undo')) {
            if (Notey.shiftDown) {
                note.redo();
            } else {
                note.undo();
            }
        } else if (buttonEl.classList.contains('dragbar-color')) {
            note.toggleColor();
            note.updateModified();
        } else if (buttonEl.classList.contains('dragbar-download')) {
            if (Notey.shiftDown) {
	        note.getPngDataURL(function(dataURL) {
                    var dl = document.createElement('a');
                    dl.href = dataURL;
                    dl.download = 'notey-' + note.id + '-' + new Date().getTime() + '.png';
                    dl.click();
	        });
                return;
            }
            var dl = document.createElement('a');
            dl.href = Notey.makeDataUrl('image/svg+xml', '<!-- notey ' + note.version + ' https://github.com/naknomum/scribby created ' + new Date().toISOString() + ' at ' + document.location.href + ' id=' + note.id + ' -->' + note.svg.outerHTML);
            dl.download = 'notey-' + note.id + '-' + new Date().getTime() + '.svg';
            dl.click();
        } else if (buttonEl.classList.contains('dragbar-share')) {
            var sh = document.createElement('div');
            sh.style.position = 'absolute';
            sh.style.top = '40px';
            sh.style.left = '-50%';
            sh.style.width = '200%';
            sh.style.backgroundColor = '#EEE';
            sh.style.padding = '6px';
            sh.style.border = 'solid 2px #CCC';
            var h = '<div style="width: 15%; display: inline-block">svg</div><input style="width: 80%;" onClick="this.select(); document.execCommand(\'copy\');" value="' + Notey.makeDataUrl('image/svg+xml', note.svg.outerHTML) + '" /><br />';
            h += '<div style="width: 15%; display: inline-block">png</div><input id="png-src" style="width: 80%;" onClick="this.select(); document.execCommand(\'copy\');" value="" /><br />';
            //not yet implemented:
            //if (note.remoteId && note.shareable) h += '<div style="width: 15%; display: inline-block">share</div><input style="width: 80%;" onClick="this.select()" value="' + document.location.href + '#Notey-' + note.id + '" /><br />';
            h += '<div style="text-align: center; margin-top: 5px;"><img style="width: ' + note.el.clientWidth + 'px; height: ' + note.el.clientHeight + 'px; border: solid 1px #888;" id="png-img" /></div>';
            h += '<div style="position: absolute; bottom: 4px; right: 4px;" class="dragbar-button dragbar-close" onClick="this.parentElement.remove()"></div>'
            //maybe to explore: copying image to clipboard - https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write
            sh.innerHTML = h;
            note.el.appendChild(sh);
	    note.getPngDataURL(function(dataURL) {
                document.getElementById('png-src').value = dataURL;
                document.getElementById('png-img').src = dataURL;
            });
        } else {
            console.warn('unknown dragbar button %o on %o', buttonEl, note);
        }
    }

    static uuidv4() {  // h/t https://stackoverflow.com/a/2117523
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }
}


