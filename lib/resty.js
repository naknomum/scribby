/*
    handles rest save/read ... functional, but kind of experimental 

    https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
*/

class Resty {
    static any(url = '', method = 'GET', data = null) {
    // Default options are marked with *
        var args = {
            method: method, // *GET, POST, PUT, DELETE, etc.
            mode: "cors", // no-cors, cors, *same-origin
            cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
            credentials: "same-origin", // include, *same-origin, omit
            headers: {
                "Content-Type": "application/json",
            },
            redirect: "follow", // manual, *follow, error
            referrer: "no-referrer", // no-referrer, *client
        };
        if (data) args.body = JSON.stringify(data);
        return fetch(url, args);
    }

    static get(url = '') {
        return Resty.any(url);
    }
    static post(url = '', data = {}) {
        return Resty.any(url, 'POST', data);
    }
    static put(url = '', data = {}) {
        return Resty.any(url, 'PUT', data);
    }
    static delete(url = '') {
        return Resty.any(url, 'DELETE');
    }
}

/* 

some potential places to store json.  functionality tested with jsonblob.com -- it is pretty great!

https://jsonblob.com/api
http://myjson.com/api
https://jsonbin.io/
https://cloud.google.com/storage/docs/json_api/
https://www.npoint.io/
https://developer.openstack.org/api-ref/object-store/

*/
