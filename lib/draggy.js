/*
    just some help for dragging Noteys

    h/t https://stackoverflow.com/a/24050777
*/
class Draggy {
    //passed element 'el' must be position: absolute
    //dragEl is optional - is area where mousedown must be ("dragbar") -- if null, all of el is used
    constructor(el, dragEl) {
        this.el = el;
        this.dragEl = dragEl || el;
        this.mousePosition = null;
        this.offset = [0,0];
        this.isDown = false;
        this.init();
        this.moved = false;
    }

    init() {
        //this.el.style.position = "absolute";  ??
        var me = this;
        this.dragEl.addEventListener('mousedown', function(ev) {
            me.isDown = true;
            me.moved = false;
            me.el.classList.add('drag-down');
            me.offset = [
                me.el.offsetLeft - ev.clientX,
                me.el.offsetTop - ev.clientY
            ];
        }, true);
        document.addEventListener('mouseup', function() {
            if (!me.isDown) return;
            me.stopMove();
            if (me.moved) {
                me.el.dispatchEvent(new Event('draggy.moved'));
                me.moved = false;
            }
        }, true);
        //this.dragEl.addEventListener('mouseout', function() { me.stopMove(); }, true);
        document.addEventListener('mousemove', function(ev) {
            if (!me.isDown) return;
            me.el.classList.remove('drag-down');
            me.el.classList.add('dragging');
            ev.preventDefault();
            me.moved = true;
            me.mousePosition = {
                x: event.clientX,
                y: event.clientY
            };
            me.el.style.left = (me.mousePosition.x + me.offset[0]) + 'px';
            me.el.style.top  = (me.mousePosition.y + me.offset[1]) + 'px';
        }, true);
    }

    stopMove() {
        this.isDown = false;
        this.el.classList.remove('dragging');
    }

}

