(function() {

  var reasoner_module = require('./Reasoner');
  var parser_module = require('./Parser');

  var Planner = function(_dirname, board){

    var default_path = _dirname;

    var reasoner = new reasoner_module.Reasoner(default_path, "eye");
    var parser = new parser_module.Parser(default_path);

    var board = board;


    /*
    plan = [
      {
        "lemmaID": "p:lemma2",
        "blocksForNextUrl": [
          {
            "blockID": "sk41",
            "path": [ "http://www.schema.org/latitude" ]
          },
          {
            "blockID": "sk42",
            "path": [ "http://www.schema.org/longitude" ]
          }
        ]
      },
      {
        "lemmaID" : "p:lemma3",
        "blocksForNextUrl" : [
          {
            "blockID": "sk41",
            "path" : ["http://www.vocab.com/1v#hasSomethingElse", "http://www.vocab.com/1v#hasSomething"]
          }
        ]
      },
      {
        "lemmaID": "p:lemma5"
      }
    ]
    */
    var plan = []; //list of ordered lemmas to invoke to reach the plan
    var lemmas_related_plan = {}; //lemmas related only the plan

    /*
    buffer_resources_dependencies = {
      "p:lemmaA" : [
        {
          "@id" : "/plants/",
          "@type" : "http://.../Collection",
          "dependantFrom" : ""
        }
      ],
      "p:lemmaB" : [
        { 
          "@id" : "/plants/1",
          "@type" : "http://.../Plant",
          "dependantFrom" : "/plants/"
        },
        { 
          "@id" : "/plants/2",
          "@type" : "http://.../Plant",
          "dependantFrom" : "/plants/"
        }
      ],
      "p:lemmaC" : [
        { 
          "@id" : "/sensors/1",
          "@type" : "http://.../TemperatureSensor"
          "dependantFrom" : "/plants/1",
          "data" : {}
        },
        { 
          "@id" : "/sensors/2",
          "@type" : "http://.../LightSensor"
          "dependantFrom" : "/plants/2",
          "data" : {}
        }
      ]
    }
    */
    var buffer_resources_dependencies = {};

    var allPlans = []; //all the possible plans
    var allLemmas = []; //all the possible lemmas



    this.generateProofs = function(nameOfGoal, isTherePreference, callback){
      reasoner.generateAllPlans(board.ID, nameOfGoal, isTherePreference, function(){
        parser.parserAllPlans('/outputs/parser.n3', function(resulted_plans){
          allPlans = resulted_plans.plans;
          allLemmas = resulted_plans.lemmas;
          callback();
        });
      }); 
    }


    /*
    * Input Parameters: 
    * type = shortest|longest that means: longer = is the more complete and general 
    *        plan... also the more complex to manage. shorter = says to directly invoke </plants/ID> (is an example).
    */
    this.selectPlanToExecute = function(type){

      if(allPlans.length == 0)
        return -1;

      if(type == "longest"){

        // (1) ciclo per trovare the longest plan. Ex: ["p:lemma1", "p:lemma2", "p:lemma3"] instead ["p:lemma4"]
        // (2) salvo the longest plan in "plan = [ {"lemmaID" : "p:lemma1"}, {"lemmaID" : "p:lemma2"}, {"lemmaID" : "p:lemma3"} ]"
        // (3) estraggo e salvo in lemmas_related_plan solo i lemmi che hanno per id proprio gli elementi contenuti nel piano

        var plan_id = 0; //index of plan to execute
        var current_max_num_lemmas = 0;
        for(var i = 0; i < allPlans.length; i++){             //(1)
          if(allPlans[i].length > current_max_num_lemmas){
            current_max_num_lemmas = allPlans[i].length;
            plan_id = i;
          }
        }

        //console.log("allPlans: " + allPlans);
        //console.log("allLemmas: " + JSON.stringify(allLemmas));

        for(var i = 0; i < allPlans[plan_id].length; i++){    //(2) & (3)
          plan.push({ "lemmaID" : allPlans[plan_id][i] });
          lemmas_related_plan[allPlans[plan_id][i]] = allLemmas[allPlans[plan_id][i]];
        }

      }
      else{

        // (1) ciclo per trovare the shortest plan. Ex: ["p:lemma4"] instead ["p:lemma1", "p:lemma2", "p:lemma3"]
        //     NB: Se c'è più di un piano con 1 solo lemma... dovrei prendere tutti i piani con 1 solo
        //     lemma ed eseguirli in parallelo (non in sequenza!)
        // (2) salvo the shortest plan in "plan = ["p:lemma4"]"
        // (3) estraggo e salvo in lemmas_related_plan solo i lemmi che hanno per id proprio gli elementi contenuti nel piano

        //TODO

      }

      // (4) devo costruirmi il vero e proprio "plan", cioè devo capire come arrivare ai vari URLs da invocare.
      //     Per tanto eseguo le seguenti azioni (CICLICHE!):
      //     (4.a) prendo il lemma successivo (next_lemma) rispetto a quello attualmente considerato (se non è l'ultimo) e
      //           determino _:skX_Y riguardante il lemma attualmente considerato.
      //     (4.b) determino la lista di proprietà da dover seguire per arrivare all'_:skX_Y (che mi dirà l'URL o gli URLs
      //           da invocare per progredire nella sequenza di lemmi all'interno del plan).
      // A questo punto dovrei avere la variabile "plan" completa come nell'esempio sopra.
      // Fare attenzione alle collection vs single URL.

      for(var i = 0; i < plan.length; i++){
        //what is the last lemma's block ID? It depends from the next lemma to execute!
        if(i != (plan.length-1)){
          plan[i].blocksForNextUrl = [];
          var current_lemma_ID = plan[i].lemmaID;
          var next_lemma_ID = plan[(i+1)].lemmaID;

          var starting_block = lemmas_related_plan[current_lemma_ID].operation.returns;

          var ending_block = lemmas_related_plan[next_lemma_ID].operation["@id"];

          //resolve @id like "http://127.0.0.1:3302/weather/current?lat={sk41}&lon={sk42}"
          if(/(.*?)\{(.*?)\}(.*?)/.test(ending_block)){
            var uri_variables = ending_block.match(/\{(.*?)\}/g); //ex: ["{sk41}","{sk42}"]

            for(var y=0; y<uri_variables.length; y++){
              var ending_ID = uri_variables[y].replace("{", "").replace("}", "");
              plan[i].blocksForNextUrl.push({
                blockID : ending_ID,
                path : generatePropertiesPath(starting_block, ending_ID, lemmas_related_plan[current_lemma_ID]).reverse()   // (4.b)
              });
            }
          }
          else{
            //in case of not more than 1 skX - just do the push of the only one blockID
            //NB: I use reverse() just to have the sequence of properties from the first (the most external) to the last (the innermost)
            plan[i].blocksForNextUrl.push({
              blockID : ending_block,
              path : generatePropertiesPath(starting_block, ending_block, lemmas_related_plan[current_lemma_ID]).reverse()   // (4.b)
            });
          }
        }
        else { /* here, it is the last lemma of the plan - nothing to do */ }
      }

      console.log("Plan selected...run it!");
      //console.log(JSON.stringify(plan));

      return 0;

    }
    
    this.runPlan = function (data, cb_nextExecution, cb_planCompleted, functionName, callback_return_algorithm){
      //I need a "surrogate" function because "this" generates scope problems.
      __runPlan(data, cb_nextExecution, cb_planCompleted, functionName, callback_return_algorithm);
    }


    var __runPlan = function(data, cb_nextExecution, cb_planCompleted, functionName, callback_return_algorithm){

      if(Object.keys(data).length == 0){
        //We are here only for the first time - when I have to execute the first lemma of plan
        var url = lemmas_related_plan[plan[0].lemmaID].operation["@id"];
        var requestType = lemmas_related_plan[plan[0].lemmaID].operation["method"];
        buffer_resources_dependencies[plan[0].lemmaID] = [];
        buffer_resources_dependencies[plan[0].lemmaID].push({
          "@id" : url,
          "dependantFrom" : ""
        });
        cb_nextExecution(getServiceURL(url), url, requestType, __runPlan, functionName, callback_return_algorithm);
      }
      else{

        //I need to save "data" just because in case of graph + last lemma, the data has to be
        //exactly the same of the original
        var original_data = data;

        /**************************************************************************
        * Here I take only the first graph in the list.
        * It's not a good way to deal with collection of graphs...it's ok just for this use case
        * In a more general M2M communication, a better solution should be found.
        ***************************************************************************/
        if(data.hasOwnProperty("@graph")){
          var tmp_graph = data["@graph"];
          if(isArray(tmp_graph)){
            data = tmp_graph[0]["@graph"][0];
          }
          else
            data = tmp_graph;
        }


        // (1) Check if I have execute all the lemmas. If the response is "yes" (index_current_lemma == plan.length),
        // I have finished and have to execute the callback "cb_planCompleted". Opposite case,
        // I have to go forward to the next lemma and execute the callback "cb_nextExecution" (1 or more times).

        var index_current_lemma = getLemmaIndexFromURL(data["@id"]) + 1;

        if(index_current_lemma < (plan.length)){

          console.log(">> Response Received by " + data["@id"]);
          console.log("Go with the next lemma");

          // (2) Now I have to compare the data returned by HTTP request with the sequence
          //     of properties for the lemma with "index_current_lemma". The goal is to understand
          //     what is/are the URL(s) for the next lemma. There are three cases to manage:
          //     (2.a) the sequence of properties returns a single URL;
          //     (2.b) the sequence of properties returns a collection of URLs;
          //     (2.c) the sequence of properties contains one property that is a collection!
          //           The final property (following the sequence of properties) could be a
          //           single URL or itself a collection of URLs.
          // NB: For case (2.b) and (2.c) we have to do a cycle of "cb_nextExecution" but not
          //     increment index_current_lemma for each invocation.


          /*
          (3) Cases considered for _tmp_ values:
          (3.a)
          [ { '@id': 'http://127.0.0.1:3300/plants/1',
              '@type': 'http://www.example.org/vocab#Plant' },
            { '@id': 'http://127.0.0.1:3300/plants/2',
              '@type': 'http://www.example.org/vocab#Plant' } ]

          (3.b)
          [ 37.5261719, 15.0756884 ]
          */        

          var _tmp_ = []; //it's always a list of numbers or objects (never a list of list)

          for(var y=0; y<plan[(index_current_lemma-1)].blocksForNextUrl.length; y++){
            var path_for_lemma = plan[(index_current_lemma-1)].blocksForNextUrl[y].path;
            //tmp_current_property: scrematura di data via via in base al path_for_lemma.
            //Serve per sapere se path_for_lemma mi da una lista o un oggetto.
            var tmp_current_property = data[path_for_lemma[0]];
            //var _tmp_ = []; //it's always a list of one or more objects (never a list of list)
            _tmp_ = getNextDataToken(tmp_current_property, _tmp_);

            for(var i=1; i < path_for_lemma.length; i++){
              if(hasOneItem(_tmp_)){
                tmp_current_property = _tmp_[0][path_for_lemma[i]];
                _tmp_ = []; //empty
                _tmp_ = getNextDataToken(tmp_current_property, _tmp_);
              }
              else{
                var _copy_tmp_ = _tmp_;
                _tmp_ = []; //empty
                for(var y=0; y<_copy_tmp_.length; y++){
                  tmp_current_property = _copy_tmp_[y][path_for_lemma[i]];
                  _tmp_ = getNextDataToken(tmp_current_property, _tmp_);
                }
              }
            }
          }          

          
          if(!buffer_resources_dependencies.hasOwnProperty(plan[index_current_lemma].lemmaID))
            buffer_resources_dependencies[plan[index_current_lemma].lemmaID] = [];
          
          
          if(isObject(_tmp_[0])){
            //(3.a) _tpm_ contains one or many objects
            for(var h=0; h<_tmp_.length; h++){
              var requestType = lemmas_related_plan[plan[index_current_lemma].lemmaID].operation["method"];
              var url = _tmp_[h]["@id"];

              //update the "buffer_resources_dependencies"
              buffer_resources_dependencies[plan[index_current_lemma].lemmaID].push({
                "@id" : url,
                "dependantFrom": data["@id"]
              });
              //callback to call a new http request
              cb_nextExecution(getServiceURL(url), url, requestType, __runPlan, functionName, callback_return_algorithm);
            }
          }
          else{
            //(3.b) _tmp_ contains a list of numbers
            var url = "";
            var requestType = lemmas_related_plan[plan[index_current_lemma].lemmaID].operation["method"];

            var blocks = []
            lemmas_related_plan[plan[index_current_lemma].lemmaID].operation["@id"].match(/\{(.*?)\}/g).forEach(function(block){
              blocks.push(block.replace("{", "").replace("}", ""));
            });
            var url_segmented = lemmas_related_plan[plan[index_current_lemma].lemmaID].operation["@id"].split(/\{(.*?)\}/g);

            url_segmented.forEach(function(part_url){
              var found = false;
              var i=0;
              for(i=0; i<blocks.length; i++){
                if(part_url == blocks[i]){
                  found = true;
                  break;
                }
              }
              if(found)
                url += _tmp_[i];
              else
                url += part_url;
            });

            //update the "buffer_resources_dependencies"
            buffer_resources_dependencies[plan[index_current_lemma].lemmaID].push({
              "@id" : url,
              "dependantFrom": data["@id"]
            });
            //callback to call a new http request
            cb_nextExecution(getServiceURL(url), url, requestType, __runPlan, functionName, callback_return_algorithm);
          }
          
        }
        else{

          console.log(">> Response Received by " + data["@id"]);
          console.log("Check if the whole plan was completed");

          //The last lemma could be a collection... so that cb_planCompleted()
          //has to be invoked when the last url of the last lemma have got its response.

          var lemmaID = plan[(index_current_lemma-1)].lemmaID;
          var num_current_data_stored = 0;
          var total_number_aspected_requestes = buffer_resources_dependencies[lemmaID].length;
          var found = false;

          for(var i=0; i<buffer_resources_dependencies[lemmaID].length; i++){
            // Save original_data for the url received => nb: I need "found" and to check if the
            // data property is alredy in, because I could receive one URL that is in
            // buffer_resources_dependencies more that one time. In this case I have to add only
            // one time the data!
            // ex: /plants/sensors/2 is received two times becasue two plants use the same sensor.
            if(!found && buffer_resources_dependencies[lemmaID][i]["@id"] == data["@id"] && !buffer_resources_dependencies[lemmaID][i].hasOwnProperty("data")){
              buffer_resources_dependencies[lemmaID][i].data = original_data;
              found = true;
            }
            // Check that all the data for all the last URLs in the last lemma
            // are contained in buffer_resources_dependencies 
            if(buffer_resources_dependencies[lemmaID][i].hasOwnProperty("data"))
              num_current_data_stored++;
          }

          //callback executes only when the whole plan was completed
          if(total_number_aspected_requestes == num_current_data_stored)
            cb_planCompleted(buffer_resources_dependencies, functionName, callback_return_algorithm);
        
        }      
      }
    }


    /*
    * Suppose that each X lemma has a returned value. A (X+1) lemma depends from one property of X lemma.
    * We use a Bottom-Up Algorithm to generate the path (the sequence of properties to follow) in order
    * to know what is the URL of (X+1) lemma.
    * This function returns a list ("path") that contains the sequence of properties in reverse order.
    * Example: for X lemma, path=["http://www.vocab.com/1v#hasSomething", "http://www.vocab.com/1v#hasSomethingElse"]
    * Using the jsonld returned invoking X lemma, I have to search, first of all, the "hasSomethingElse" property and
    * then the "hasSomething" property. In other words "hasSomething" is an inner property than "hasSomethingElse".
    */
    var generatePropertiesPath = function(starting_block, ending_block, current_lemma){
      var path = [];

      var searchedID = ending_block;
      var found = false;
      
      while(!found){
        for(var key in current_lemma){
          if(key != "operation"){
            for(var i=0; i<current_lemma[key].supportedProperty.length; i++){
              if(current_lemma[key].supportedProperty[i].range == searchedID){
                path.push(current_lemma[key].supportedProperty[i]["@id"]);
                searchedID = key;
              }
            }
          }
        }
        //Music: Naya Rivera - Mine
        if(searchedID == starting_block)
          found = true;
      }
          
      return path;
    }


    /*
    * Method to support the search of the new URL for the next lemma.
    */
    var getNextDataToken = function(tmp_current_property, _tmp_){
      if(isArray(tmp_current_property)){
        for(var x=0; x<tmp_current_property.length; x++)
          _tmp_.push(tmp_current_property[x]);
      }
      else
        _tmp_.push(tmp_current_property);
      return _tmp_;
    }


    /*
    * Check if the url is a resource got from the last lemma of plan.
    */
    var getLemmaIndexFromURL = function(url){
      var lemmaID_for_url = "";
      for (var lemmaID in buffer_resources_dependencies){
        for(var x=0; x<buffer_resources_dependencies[lemmaID].length; x++){
          if(buffer_resources_dependencies[lemmaID][x]["@id"] == url){
            lemmaID_for_url = lemmaID;
            break;
          }
        }
      }
      for(var x=0; x<plan.length; x++){
        if(plan[x].lemmaID == lemmaID_for_url)
          return x;
      }
      return -1;
    }


  }//end class Planner



  /*
  * Check if a property is an Array.
  */
  var isArray = function(a){
      return (!!a) && (a.constructor === Array);
  };

  /*
  * Check if a property is an Object.
  */
  var isObject = function(a){
      return (!!a) && (a.constructor === Object);
  };

  /*
  * Check if an Array has one or more elements.
  */
  var hasOneItem = function(a){
      if(a.length == 1)
        return true;
      return false;
  };


  var getServiceURL = function(url){
    var base_url = url.replace(/http:\/\//, '');
    base_url = base_url.split(/^(.*?)\//);
    return {
      host : base_url[1].split(":")[0],
      port : base_url[1].split(":")[1],
      url : "/" + base_url[2]
    };
  }


  exports.Planner = Planner;

})();