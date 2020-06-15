
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
        this.version = '1.0b';  //TODO could check against json.version ??
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
        var s = Math.floor(Math.random() * 60) + 150;
        this.el.style.width = (json.width || s) + 'px';
        this.el.style.height = (json.height || s) + 'px';
        this.el.style.backgroundColor = Notey.colorChoices[this.bgColorId];
        this.init();
        this.scribby = new Scribby(this.svg, json.scribby);
        if (this.strokeColorId != 0) this.scribby.setAttrStroke(Notey.colorChoices[this.strokeColorId]);
        Notey.allNoteys[this.id] = this;
        return this;
    }

    init() {
        var me = this;
        this.canvas = document.createElement('canvas');
        if (this.wobbly) this.el.style.transform = 'rotate(' + (8 - Math.random() * 16) + 'deg)';

        this.dragbar = document.createElement('div');
        this.dragbar.id = this.id + '-dragbar';
        this.dragbar.classList.add('dragbar');
        var cbg = (this.strokeColorId == 0) ? '' : ' style="background-color: ' + Notey.colorChoices[this.strokeColorId] + '" ';
        var h = '<div class="dragbar-button dragbar-close" onClick="Notey.dragbarClick(this)">&#x2715;</div>';
        h += '<div class="dragbar-button dragbar-reset" onClick="Notey.dragbarClick(this)">!</div>';
        h += '<div ' + cbg + ' id="dragbar-button-color-' + this.id + '" class="dragbar-button dragbar-color" onClick="Notey.dragbarClick(this)">#</div>';
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
                    Notey._needTextSave = false;
                    n.save();
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

    getDataURL(callback) {
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

    save(noSync) {
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
        if (this.storeLocal) window.localStorage.removeItem(this.localStorageKey());
        //TODO other stuff here on the object itself!
        delete(Notey.allNoteys[this.id]);
        //unfortunately no way to destroy this in memory cuz we still have reference; so caller must do that!  :(
    }

    // this is tailored to jsonblob api! (e.g. PUT vs POST)    TODO generalize
    sync() {
        if (!Notey.remoteUrl) return false;
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

    remoteDelete() {
        if (!this.remoteId) return;
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
            if (ev.keyCode > 31) this._keyText = ev.key;
        } else if (ev.keyCode > 31) {
            this._keyText += ev.key;
        } else if ((ev.keyCode == 8) && (this._keyText.length > 0)) {
            this._keyText = this._keyText.substring(0, this._keyText.length - 1);
        } else {
            return;
        }
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
        } else if (buttonEl.classList.contains('dragbar-color')) {
            note.toggleColor();
            note.updateModified();
        } else {
            console.warn('unknown dragbar button %o on %o', buttonEl, note);
        }
    }

    static uuidv4() {  // h/t https://stackoverflow.com/a/2117523
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}


