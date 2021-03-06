(function() {

  var LineByLineReader = require('line-by-line');


  var Parser = function(_dirname){
  
    var default_path = _dirname;

    this.parserAllPlans = function(file_name, callback){

      var file = default_path + file_name;
      var lr = new LineByLineReader(file);

      /*
      Example:
      prefixes = {
        "vocab" : "http://www.blablabla.org/1/#",
        "ont" : "http://www.ahahah.org/#",
        "c" : "urn:composition#"
      }
      */
      var prefixes = {};


      var lemmas = {};

      /*
      Example:
      plans = [
        ["p:lemma1", "p:lemma2"],  > Plan1: p:lemma1 has to be executed before to p:lemma2
        ["p:lemma3"]               > Plan2
      ]
      */
      var plans = [];

      var prefix_useful = [];
      c = "urn:composition#";

      var previousLemma = "";


      lr.on('error', function (err) {
          // 'err' contains error object
          console.log("Error on Parser in reading file line by line!");
      });

      lr.on('line', function (line) {

          if(/^#/.test(line)){ /*if I have a comment, ignore it!*/ }
          else if(/^@prefix/.test(line)){
            //if I have a prefix, convert it in context
            splitted_line = line.split(/\s+/);
            var tmp_prefix_vocabulary = '';
            for(var x=0; x<splitted_line.length; x++){
              if(splitted_line[x] == "@prefix"){ /* pass */ }
              else if(/<(.*?)>\./.test(splitted_line[x])){
                iri_vocabulary = splitted_line[x].match(/<(.*?)>/, '')[1];
                prefixes[tmp_prefix_vocabulary] = iri_vocabulary;

                //Music: Sarah Brightman & Enya: Deliver Me => <3
                if(iri_vocabulary == c)
                  prefix_useful[c] = tmp_prefix_vocabulary;
              }
              else if(/:$/.test(splitted_line[x])){
                tmp_prefix_vocabulary = splitted_line[x].replace(/:/,'');
                prefixes[tmp_prefix_vocabulary] = '';
              }
            }
          }
          else{
            //here we have the real RDF statements
            
            if(line == "" || line == null) { /* Empty row - ignore it! */ }
            else if(line.indexOf(prefix_useful[c]+":ServiceCall") > -1){
              lemmas[line.split(/\s+/)[0]] = {};
            }
            else if(line.indexOf(prefix_useful[c]+":hasDependency") > -1){
              lemmaSX = line.split(/\s+/)[0];
              lemmaDX = line.split(/\s+/)[2].replace(/\.$/,'');          
              var found = false;
              for(var q=0; q<plans.length; q++){
                var last_lemma_for_plan = plans[q][(plans[q].length-1)];
                if(last_lemma_for_plan == lemmaDX){
                  plans[q].push(lemmaSX); //continue a plan that was previously inserted
                  found = true;
                  break;
                }
              }
              if(!found)
                plans.push([lemmaDX,lemmaSX]); //new plan
            }
            else if(line.indexOf(prefix_useful[c]+":details") > -1){
              //Example of line >>> p:lemma4 c:details {_:sk8_1 http:methodName "GET".
              tokens = line.split(/\s+/);
              tokens = remove_(tokens);
              if (typeof(lemmas[tokens[0]].operation) === 'undefined')
                lemmas[tokens[0]].operation = {};
              lemmas[tokens[0]].operation.ID = tokens[2].replace('{','');
              lemmas[tokens[0]].operation.method = tokens[4].replace('"','').replace('".','');
              previousLemma = tokens[0]; //save the id of the currently lemma useful in the next "else"
            }
            else {
              //here I'm inside the details related the previous lemma
              line = line.replace(/^\s+/, ''); //remove the black spaces at the beginning
              tokens = line.split(/\s+/);  //split for white spaces between the words
              tokens = remove_(tokens);

              if(isTheProperty(tokens[1], "http://www.w3.org/2011/http#", "requestURI" , prefixes)){
                //Examples of line >>> (1) _:sk8_1 http:requestURI <file:///plants/1/>.  OR  (2) _:sk100_1 http:requestURI _:sk67_4.
                // (3) _:sk39_1 http:requestURI (<file:///actuators/2> 0) OR (4) (_:sk13_17 "1").
                // (5) _:sk8_1 http:requestURI <http://1270.0.1:3300/plants>.  OR (6)  (<http://1270.0.1:3300/> 1)                
                // OR (6) _:sk58_1 http:requestURI (<http://127.0.0.1:3302/weather/current> "?lat=" _:sk56_2 "&lon=" _:sk57_2).
                if(tokens.length > 3){
                  var uri = "";
                  for(var t = 2; t<tokens.length; t++){
                    if(/"/g.test(tokens[t]))
                      uri += tokens[t].replace(/"/g,'').replace(").", "");
                    else if(/^sk/.test(tokens[t]))
                      uri += "{" + remove_(tokens[t].replace(").", "")) + "}";
                    else if(/</.test(tokens[t]))
                      uri += tokens[t].replace("(<", "").replace(">", "");
                    else
                      uri += "/" + tokens[t].replace(").", "");
                  }
                  lemmas[previousLemma].operation["@id"] = uri;
                }
                else{
                  if(isIRI(tokens[2])) //case (1)
                    lemmas[previousLemma].operation["@id"] = tokens[2].replace(/<file:\/\//, '').replace(/>\./, '');
                  else if(isURL(tokens[2])) //case (5)
                    lemmas[previousLemma].operation["@id"] = tokens[2].replace(/</, '').replace(/>\./, '');
                    //lemmas[previousLemma].operation["@id"] = tokens[2].replace(/<http:\/\//, '').replace(/>\./, '');
                  else //case (2)
                    lemmas[previousLemma].operation["@id"] = tokens[2].replace(/\.$/, '');
                }
              }
              else if(isTheProperty(tokens[1], "http://www.w3.org/2011/http#", "resp" , prefixes)){
                //Example of line >>> _:sk58_1 http:resp _:sk59_1.
                lemmas[previousLemma].operation["returns"] = tokens[2].replace(/\.$/, '');
              }
              else if(isTheProperty(tokens[1], "http://www.w3.org/2011/http#", "body" , prefixes)){
                //Example of line >>> _:sk59_1 http:body _:sk24_2.  --- NB: _:sk59_1 could be: (1) operation ID or (2) the response ID.
                if(lemmas[previousLemma].operation.ID == tokens[0]) //case (1)
                  lemmas[previousLemma].operation["expects"] = tokens[2].replace(/\.$/, '');
                else  //case (2)
                  lemmas[previousLemma].operation["returns"] = tokens[2].replace(/\.$/, '');
              }
              else{
                //if I'm here, I have the descriptions of inputs/outputs for each invokation
                //check the subject => exist or not? if not, I create it in the corrispondent lemma
                if (typeof(lemmas[previousLemma][tokens[0]]) === 'undefined'){
                  lemmas[previousLemma][tokens[0]] = {};
                  //lemmas[previousLemma][tokens[0]]["@id"] = lemmas[previousLemma][tokens[0]];
                  lemmas[previousLemma][tokens[0]]["supportedProperty"] = [];
                }

                //check the property => or "a" or "other"
                if(tokens[1] == "a") {
                  //check if the object is already extended or not
                  if(isIRINotLocal(tokens[2]) || isIRI(tokens[2]) || isURL(tokens[2]))
                    lemmas[previousLemma][tokens[0]]["@type"] = tokens[2].replace(/\.$/, '').replace('}', '').replace("<", '').replace(">", '');
                  else
                    lemmas[previousLemma][tokens[0]]["@type"] = expandEntity(tokens[2], prefixes);
                }else{
                  if(isIRINotLocal(tokens[1]) || isIRI(tokens[1]) || isURL(tokens[2])){
                    //here token[1] is already expanded! We don't need to modify it.
                    lemmas[previousLemma][tokens[0]]["supportedProperty"].push({
                      "@id" : tokens[1].replace("<", '').replace(">", ''),
                      "domain" : tokens[0],
                      "range" : tokens[2].replace(/\.$/, '').replace('}', '')
                    });
                  }
                  else{
                    //here token[1] has to be expanded
                    lemmas[previousLemma][tokens[0]]["supportedProperty"].push({
                      "@id" : expandEntity(tokens[1], prefixes),
                      "domain" : tokens[0],
                      "range" : tokens[2].replace(/\.$/, '').replace('}', '')
                    });
                  }
                }
              }
            }
          }

      });

      lr.on('end', function () {
          // All lines are read, file is closed now.

          //I search if all the lemmas are at least one time in the plants array. In case, I add them
          var lemmas_names = Object.keys(lemmas);
          for(var q=0; q<lemmas_names.length; q++){
            var isInsert = false;
            for(var i=0; i<plans.length; i++){
              for(var x=0; x<plans[i].length; x++){
                if(plans[i][x] == lemmas_names[q]){
                  isInsert = true;
                  break;
                }
              }
            }
            if(isInsert == false)
              plans.push([lemmas_names[q]]);
            //Music: Imagine Dragons: It's Time
          }

          //console.log(JSON.stringify(lemmas));
          //console.log(plans);

          callback({ "lemmas" : lemmas, "plans" : plans });
      });

    }

  }


  var isTheProperty = function(searchedProperty, vocabulary, entity, prefixes){
    property = searchedProperty.split(":");
    if(property.length > 1){
      if(prefixes[property[0]] == vocabulary && property[1] == entity)
        return true;
      return false
    }
    return false;
  }

  var isURL = function(supposedURL){
    if(/<http:\/\/(.*?)>/.test(supposedURL))
      return true;
    return false;
  }

  var isIRI = function(supposedIRI){
    if(/<file:\/\/(.*?)>/.test(supposedIRI))
      return true;
    return false;
  }

  var isIRINotLocal = function(supposedIRI){
    if(/<http(.*?)>/.test(supposedIRI))
      return true;
    return false;
  }

  var expandEntity = function(entity, prefixes){
    entity = entity.replace(/\.$/, '').replace('}', '');
    splitted_entity = entity.split(":");
    return (prefixes[splitted_entity[0]] + splitted_entity[1]);
  }

  var remove_ = function(tokens){
    //from _:sk39_1 => to sk39 (nothing should change in the next)
    for(var u=0; u<tokens.length; u++){
      if(/_:/.test(tokens[u])){
        var tmp = tokens[u].split(/(_:|_)/);
        tokens[u] = tmp[2];
      }
    }
    return tokens;
  }


  exports.Parser = Parser;

})();