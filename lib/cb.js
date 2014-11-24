var couchbase = require('couchbase');
var N1qlQuery = couchbase.N1qlQuery;
var SqlConnector = require('loopback-connector').SqlConnector;
var async = require('async');
var debug = require('debug')('loopback:connector:couchbase');
var clauseBuilderClass = require("./clauseBuilder"); // node.js core module

/**
 * @module loopback-connector-couchbase
 *
 * Initialize the Couchbase connector against the given data source
 *
 * @param {DataSource} dataSource The loopback-datasource-juggler dataSource
 * @param {Function} [callback] The callback function
 */
exports.initialize = function initializeDataSource(dataSource, callback) {
	EClog("couchbase connector initializeDataSource()");
	if (!couchbase) {
		EClog("couchbase connector initializeDataSource(): Error happened, No couchbase module avaialbe");
		return;
	}
 	var s = dataSource.settings;
EClog("couchbase is: " + JSON.stringify([couchbase]));
	var options = {
		dsname: s.name,
		dsconnector: s.connector,
	    host: s.host || 'localhost',
	    port: s.port || 8091,
	    n1qlport: s.n1qlport || 8093,
	    bucket: s.bucket || 'default',
	    env: s.env || 'debugging',
	    connectionTimeout: s.connectionTimeout || 20000,
	    operationTimeout: s.operationTimeout || 15000
	};
	options.connectUrl = "couchbase://" + options.host;  //do not attach any port number such as 8901, will cause error code 24 which means "Error while establishing TCP connection"
	options.n1qlUrl = options.host + ":" + options.n1qlport;  
 
	EClog("couchbase connector initializeDataSource(): options:" + JSON.stringify([options]));
	//initializes the Couchbase connector:
	dataSource.connector = new CouchbaseDB(options, dataSource);

	//connect to couchbase db
	if (callback) {
	    dataSource.connector.connect(callback);
	}


};

/**
 * @constructor
 * Constructor for Couchbase connector
 * @param {Object} client The node-mysql? client object
 */
function CouchbaseDB(settings, dataSource) {
 EClog("couchbase connector CouchbaseDB()"); 

  this.name = 'couchbase';
  this._models = {};
  this.settings = settings;
  this.dataSource = dataSource;
}

require('util').inherits(CouchbaseDB, SqlConnector);

exports.CouchbaseDB = CouchbaseDB;

function EClog(s){
  console.log("      EC LOG: " + s);
}


/*
	**************************start implementing the interface methods*****************************************
*/

CouchbaseDB.prototype.connect = function (callback) {
  var self = this;
  if (self.db) {
    process.nextTick(function () {
      callback && callback(null, self.db);
    });
  } else {
//EClog("couchbase in CouchbaseDB.connect(): " + JSON.stringify([couchbase]));

	self.myCluster = new couchbase.Cluster(self.settings.connectUrl);
	

	EClog("couchbase in CouchbaseDB.connect() cluster is: " + JSON.stringify([self.myCluster]));
	EClog("N1qlQuery is: " + JSON.stringify([N1qlQuery]));

	callback && callback(null, self.db);

  }
};


/**
 * Does the common query to the couchbase server and return the result
 *
 * @param {String} sql The SQL string which follows the N1QL syntax
 * @param {Object} selfThis The reference to the "this" of this module
 * @param {Function} [callback] The callback function
 */
var cbquery = function (sql,selfThis, callback) {
	var self = selfThis;
    var myBucket = self.myCluster.openBucket(self.settings.bucket,function(err){
    	if(err){
    		callback(err,null);
    		return;
    	}

    	myBucket.enableN1ql([self.settings.n1qlUrl]);

		EClog("cbquery()  : couchbase N1QL is enabled " );



		var query = N1qlQuery.fromString(sql);
		EClog("cbquery()  : query is:  " + JSON.stringify([query]) );


		myBucket.query(query, function(err, res) {
					
		  if (err) {
			EClog("cbquery()  : query failed" + JSON.stringify([err, res]));
			callback(err,null);
			return;
		  }
		  
		  EClog("cbquery()  : success!" + JSON.stringify([err, res]));

		  callback(err,res);
		  return;
		});


  	});

};




/**
 * Find matching model instances by the filter
 *
 * @param {String} model The model name
 * @param {Object} filter The filter
 * @param {Function} [callback] The callback function
 */
/**
 * Count the model instances by the where criteria
 */
CouchbaseDB.prototype.count = function (model, callback, where) {

	var self = this;
	EClog("CouchbaseDB.prototype.count() my bucket is: " + JSON.stringify([self.myBucket])); 
	EClog("CouchbaseDB.prototype.count() : " + JSON.stringify([model, where])); 

	var qryString = 'SELECT  count(*) AS cnt FROM ' + self.settings.bucket;

	var clauseBuilderIndex = new clauseBuilderClass(); 
	
	var clausebuilderObj = clauseBuilderIndex.getClauseBuilder(where);
	var clause = clausebuilderObj.buildClause();
	EClog("CouchbaseDB.prototype.count()    clause is : " + clause); 

	qryString = qryString + " " + clause;



	EClog("CouchbaseDB.prototype.count() final query is : " + qryString); 


	cbquery(qryString,self,function(err,res){
    	if(err){
    		callback(err,null);
    		return;
    	}

		  EClog("success!" + JSON.stringify([err, res]));

	      var c = (res && res[0] && res[0].cnt) || 0;
		  callback(err,c);
		  return;


	});
};
 
/**
 * Find a model instance by id

    ?/ericurl/{id} 
 */
CouchbaseDB.prototype.find = function find(model, id, callback) {
	var self = this;
	EClog("CouchbaseDB.prototype.find() : " + JSON.stringify([model, id])); 

    var myBucket = self.myCluster.openBucket(self.settings.bucket,function(err){
    	if(err){
    		callback(err,null);
    		return;
    	}

    	myBucket.get(id,function(err, result) {
	    	if(err){
	    		callback(err,null);
	    		return;
	    	}
    		EClog("CouchbaseDB.prototype.find()  : find result is:  "  + JSON.stringify([err, result]) );
    		callback(err,result);
    		return;

    	});

  	});

};
 



var readDocumentID = function(data, callback){
	var idkey = data && data.docId;
	if(!(typeof idkey === 'string' || idkey instanceof Buffer)){
		callback("The document key '" + idkey + "', which is from the 'docId' field, should be in string format or buffer format",null);
	};

	return idkey;
};

/**
 * Create a new model instance
 */
CouchbaseDB.prototype.create = function (model, data, callback) {
	

	var self = this;
	EClog("CouchbaseDB.prototype.create() : " + JSON.stringify([model, data]));
	//var uuidobj = require('node-uuid');
	//var idkey = (data && data.docId) || uuidobj.v4();
	var idkey = readDocumentID(data, callback);


	if(!idkey){
		return;
	};


	EClog("CouchbaseDB.prototype.create() idkey: " + idkey);

    var myBucket = self.myCluster.openBucket(self.settings.bucket,function(err){
    	if(err){
    		callback(err,null);
    		return;
    	}

    	myBucket.insert(idkey,data,function(err, result) {
	    	if(err){
	    		callback(err,null);
	    		return;
	    	}
    		EClog("CouchbaseDB.prototype.create()  : create result is:  "  + JSON.stringify([err, result]) );
    		callback(err,result);

    	});

  	});


};
 
/**
 * Save a model instance
 */
CouchbaseDB.prototype.save = function (model, data, callback) {
	EClog("CouchbaseDB.prototype.save() : " + JSON.stringify([model, data])); 
	throw "stop here !";
};
 
/**
 * Check if a model instance exists by id
 */
CouchbaseDB.prototype.exists = function (model, id, callback) {
	EClog("CouchbaseDB.prototype.exists() : " + JSON.stringify([model, id])); 
	throw "stop here !";
};
 
/**
 * Update a model instance or create a new model instance if it doesn't exist
 */
CouchbaseDB.prototype.updateOrCreate = function updateOrCreate(model, data, callback) {
	EClog("CouchbaseDB.prototype.updateOrCreate() : " + JSON.stringify([model, data])); 

	

	var self = this;
	EClog("CouchbaseDB.prototype.updateOrCreate() : " + JSON.stringify([model, data]));
	//var uuidobj = require('node-uuid');
	//var idkey = (data && 'AA_'+data.id) || uuidobj.v4();


	var idkey = readDocumentID(data, callback);

	EClog("CouchbaseDB.prototype.updateOrCreate() idkey: " + idkey);

    var myBucket = self.myCluster.openBucket(self.settings.bucket,function(err){
    	if(err){
    		callback(err,null);
    		return;
    	}

    	myBucket.upsert(idkey,data,function(err, result) {
	    	if(err){
	    		callback(err,null);
	    		return;
	    	}
    		EClog("CouchbaseDB.prototype.updateOrCreate()  : updateOrCreate result is:  "  + JSON.stringify([err, result]) );
    		callback(err,result);

    	});

  	});


};
 
/**
 * Delete a model instance by id
 */
CouchbaseDB.prototype.destroy = function destroy(model, id, callback) {
	EClog("CouchbaseDB.prototype.destroy() : " + JSON.stringify([model, id])); 
	throw "stop here !";
};
 
/**
 * Query model instances by the filter

	?/ericurl/findOne
    {"where":{"name":"21st Amendment Brewery Cafe"}}
 */
CouchbaseDB.prototype.all = function all(model, filter, callback) {
	EClog("CouchbaseDB.prototype.all() : " + JSON.stringify([model, filter])); 


	var self = this;
	//EClog("CouchbaseDB.prototype.all() my bucket is: " + JSON.stringify([self.myBucket])); 
	EClog("CouchbaseDB.prototype.all() : " + JSON.stringify([model, filter])); 

	var qryString = "SELECT * FROM " + self.settings.bucket ;
	var clauseBuilderIndex = new clauseBuilderClass(); 
	var clausebuilderObj = clauseBuilderIndex.getClauseBuilder(filter);
	var clause = clausebuilderObj.buildClause();

	qryString = qryString + " " + clause;
	EClog("CouchbaseDB.prototype.all()  final query is : " + qryString); 




	cbquery(qryString,self,function(err,res){
    	if(err){
    		callback(err,null);
    		return;
    	}

		  EClog("success!" + JSON.stringify([err, res]));

	      
		  callback(err,res);
		  return;


	});



	EClog("\n\n Keep Going ..."); 
	//throw "stop here !";
};
















 
/**
 * Delete all model instances
 */
CouchbaseDB.prototype.destroyAll = function destroyAll(model, callback) {
	EClog("CouchbaseDB.prototype.destroyAll() : " + JSON.stringify([model])); 
	throw "stop here !";
};
 
/**
 * Update the attributes for a model instance by id
 */
CouchbaseDB.prototype.updateAttributes = function updateAttrs(model, id, data, callback) {
	EClog("CouchbaseDB.prototype.updateAttributes() : " + JSON.stringify([model, id, data])); 
	throw "stop here !";
};















































































