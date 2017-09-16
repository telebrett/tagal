function LRU (capacity) {

	this.capacity = capacity;

	this.values = {};

	this.first = null;
	this.last  = null;
	this.size = 0;

}

LRU.prototype.set = function(key, val) {

	var obj = { 
		k:key,
		v:val,
		l:null, // key to the left
		r:null  // key to the right
	};

	// first item
	if (this.size == 0) {
		this.first = this.last = obj;
		this.values[key] = obj;
		this.size = 1;
		return;
	}

	// if the key exists, we first need to move it to the front of the list
	if (this.values[key] !== undefined) {
		this._access(key);
		this.values[key].v = val;
		return;
	}

	// trim the list if it is too big, we should never exceed the size, but just in case
	if (this.size+1 >= this.capacity) {
		while (this.size+1 >= this.capacity) {
			this._drop();
		}
	}

	this.first.l = obj;
	obj.r = this.first;
	this.values[key] = this.first = obj;
	this.size++;

}

LRU.prototype.get = function(key) {

	if (this.values[key] === undefined) {
		return undefined;
	}

	this._access(key);

	return this.values[key].v;

}

LRU.prototype._access = function(key) {

	if (this.first && this.first.k == key) {
		//Nothing to do, it is already at the front
		return;
	}

	var obj = this.values[key];
	if (! obj) {
		//should not be here
		return false;
	}

	var left = obj.l;
	var right = obj.r;

	this.first.l = obj;
	obj.r = this.first;

	this.first = obj;

	left.r = right;
	if (right) {
		right.l = left;
	}

}

LRU.prototype._drop = function() {

	//Mark the second last 'right" as empty
	this.last.l.r = null;

	var pl = this.last;

	this.last = this.last.l;

	//Drop the lookup entry
	delete this.values[pl.k];

	this.size--;

}
