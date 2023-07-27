// A custom layout that shows the two families related to a person's parents
class GenogramLayout extends go.LayeredDigraphLayout {
  constructor() {
    super();
    this.alignOption = go.LayeredDigraphLayout.AlignAll;
    this.initializeOption = go.LayeredDigraphLayout.InitDepthFirstIn;
    this.spouseSpacing = 30;  // minimum space between spouses
    this.isRouting = false;
  }

  makeNetwork(coll) {
    // generate LayoutEdges for each parent-child Link
    const net = this.createNetwork();
    if (coll instanceof go.Diagram) {
      this.add(net, coll.nodes, true);
      this.add(net, coll.links, true);
    } else if (coll instanceof go.Group) {
      this.add(net, coll.memberParts, false);
    } else if (coll.iterator) {
      this.add(net, coll.iterator, false);
    }
    return net;
  }

  // internal method for creating LayeredDigraphNetwork where husband/wife pairs are represented
  // by a single LayeredDigraphVertex corresponding to the label Node on the marriage Link
  add(net, coll, nonmemberonly) {
    const horiz = this.direction == 0.0 || this.direction == 180.0;
    const multiSpousePeople = new go.Set();
    // consider all Nodes in the given collection
    const it = coll.iterator;
    while (it.next()) {
      const node = it.value;
      if (!(node instanceof go.Node) || !node.data) continue;
      if (!node.isLayoutPositioned || !node.isVisible()) continue;
      if (nonmemberonly && node.containingGroup !== null) continue;
      // if it's an unmarried Node, or if it's a Link Label Node, create a LayoutVertex for it
      if (node.isLinkLabel) {
        // get marriage Link
        const link = node.labeledLink;
        if (link.category === "Marriage") {
          const spouseA = link.fromNode;
          const spouseB = link.toNode;
          // create vertex representing both husband and wife
          const vertex = net.addNode(node);
          // now define the vertex size to be big enough to hold both spouses
          if (horiz) {
            vertex.height = spouseA.actualBounds.height + this.spouseSpacing + spouseB.actualBounds.height;
            vertex.width = Math.max(spouseA.actualBounds.width, spouseB.actualBounds.width);
            vertex.focus = new go.Point(vertex.width / 2, spouseA.actualBounds.height + this.spouseSpacing / 2);
          } else {
            vertex.width = spouseA.actualBounds.width + this.spouseSpacing + spouseB.actualBounds.width;
            vertex.height = Math.max(spouseA.actualBounds.height, spouseB.actualBounds.height);
            vertex.focus = new go.Point(spouseA.actualBounds.width + this.spouseSpacing / 2, vertex.height / 2);
          }
        }
      } else {
        // don't add a vertex for any married person!
        // instead, code above adds label node for marriage link
        // assume a marriage Link has a label Node
        let marriages = 0;
        node.linksConnected.each(l => {
          if (l.category === "Marriage") marriages++;
        });
        if (marriages === 0) {
          net.addNode(node);
        } else if (marriages > 1) {
          multiSpousePeople.add(node);
        }
      }
    }
    // now do all Links
    it.reset();
    while (it.next()) {
      const link = it.value;
      if (!(link instanceof go.Link)) continue;
      if (!link.isLayoutPositioned || !link.isVisible()) continue;
      if (nonmemberonly && link.containingGroup !== null) continue;
      // if it's a parent-child link, add a LayoutEdge for it
      if (link.category === "" && link.data) {
        const parent = net.findVertex(link.fromNode);  // should be a label node
        const child = net.findVertex(link.toNode);
        if (child !== null) {  // an unmarried child
          net.linkVertexes(parent, child, link);
        } else {  // a married child
          link.toNode.linksConnected.each(l => {
            if (l.category !== "Marriage" || !l.data) return;  // if it has no label node, it's a parent-child link
            // found the Marriage Link, now get its label Node
            const mlab = l.labelNodes.first();
            // parent-child link should connect with the label node,
            // so the LayoutEdge should connect with the LayoutVertex representing the label node
            const mlabvert = net.findVertex(mlab);
            if (mlabvert !== null) {
              net.linkVertexes(parent, mlabvert, link);
            }
          });
        }
      }
    }

    while (multiSpousePeople.count > 0) {
      // find all collections of people that are indirectly married to each other
      const node = multiSpousePeople.first();
      const cohort = new go.Set();
      this.extendCohort(cohort, node);
      // then encourage them all to be the same generation by connecting them all with a common vertex
      const dummyvert = net.createVertex();
      net.addVertex(dummyvert);
      const marriages = new go.Set();
      cohort.each(n => {
        n.linksConnected.each(l => {
          marriages.add(l);
        })
      });
      marriages.each(link => {
        // find the vertex for the marriage link (i.e. for the label node)
        const mlab = link.labelNodes.first()
        const v = net.findVertex(mlab);
        if (v !== null) {
          net.linkVertexes(dummyvert, v, null);
        }
      });
      // done with these people, now see if there are any other multiple-married people
      multiSpousePeople.removeAll(cohort);
    }
  }

  // collect all of the people indirectly married with a person
  extendCohort(coll, node) {
    if (coll.has(node)) return;
    coll.add(node);
    node.linksConnected.each(l => {
      if (l.category === "Marriage") {  // if it's a marriage link, continue with both spouses
        this.extendCohort(coll, l.fromNode);
        this.extendCohort(coll, l.toNode);
      }
    });
  }

  assignLayers() {
    super.assignLayers();
    const horiz = this.direction == 0.0 || this.direction == 180.0;
    // for every vertex, record the maximum vertex width or height for the vertex's layer
    const maxsizes = [];
    this.network.vertexes.each(v => {
      const lay = v.layer;
      let max = maxsizes[lay];
      if (max === undefined) max = 0;
      const sz = (horiz ? v.width : v.height);
      if (sz > max) maxsizes[lay] = sz;
    });
    // now make sure every vertex has the maximum width or height according to which layer it is in,
    // and aligned on the left (if horizontal) or the top (if vertical)
    this.network.vertexes.each(v => {
      const lay = v.layer;
      const max = maxsizes[lay];
      if (horiz) {
        v.focus = new go.Point(0, v.height / 2);
        v.width = max;
      } else {
        v.focus = new go.Point(v.width / 2, 0);
        v.height = max;
      }
    });
    // from now on, the LayeredDigraphLayout will think that the Node is bigger than it really is
    // (other than the ones that are the widest or tallest in their respective layer).
  }

  initializeIndices() {
    super.initializeIndices();
    const vertical = this.direction === 90 || this.direction === 270;
    this.network.edges.each(e => {
      if (e.fromVertex.node && e.fromVertex.node.isLinkLabel) {
        e.portFromPos = vertical ? e.fromVertex.focusX : e.fromVertex.focusY;
      }
      if (e.toVertex.node && e.toVertex.node.isLinkLabel) {
        e.portToPos = vertical ? e.toVertex.focusX : e.toVertex.focusY;
      }
    })
  }

  commitNodes() {
    super.commitNodes();
    // position regular nodes
    this.network.vertexes.each(v => {
      if (v.node !== null && !v.node.isLinkLabel) {
        v.node.position = new go.Point(v.x, v.y);
      }
    });

    const horiz = this.direction == 0.0 || this.direction == 180.0;
    // position the spouses of each marriage vertex
    this.network.vertexes.each(v => {
      if (v.node === null) return;
      if (!v.node.isLinkLabel) return;
      const labnode = v.node;
      const lablink = labnode.labeledLink;
      // In case the spouses are not actually moved, we need to have the marriage link
      // position the label node, because LayoutVertex.commit() was called above on these vertexes.
      // Alternatively we could override LayoutVetex.commit to be a no-op for label node vertexes.
      lablink.invalidateRoute();
      let spouseA = lablink.fromNode;
      let spouseB = lablink.toNode;
      if (spouseA.opacity > 0 && spouseB.opacity > 0) {
        // now prefers mothers on the left, fathers on the right
        //to fit my formatting needs.
        if (spouseA.category === "M") {  // sex changed to male to fix formatting
          const temp = spouseA;
          spouseA = spouseB;
          spouseB = temp;
        }
        // see if the parents are on the desired sides, to avoid a link crossing
        const aParentsNode = this.findParentsMarriageLabelNode(spouseA);
        const bParentsNode = this.findParentsMarriageLabelNode(spouseB);
        if (aParentsNode !== null && bParentsNode !== null &&
            (horiz
              ? aParentsNode.position.x > bParentsNode.position.x
              : aParentsNode.position.y > bParentsNode.position.y)) {
          // swap the spouses
          const temp = spouseA;
          spouseA = spouseB;
          spouseB = temp;
        }
        spouseA.moveTo(v.x, v.y);
        if (horiz) {
          spouseB.moveTo(v.x, v.y + spouseA.actualBounds.height + this.spouseSpacing);
        } else {
          spouseB.moveTo(v.x + spouseA.actualBounds.width + this.spouseSpacing, v.y);
        }
      } else if (spouseA.opacity === 0) {
        const pos = horiz
          ? new go.Point(v.x, v.centerY - spouseB.actualBounds.height / 2)
          : new go.Point(v.centerX - spouseB.actualBounds.width / 2, v.y);
        spouseB.move(pos);
        if (horiz) pos.y++; else pos.x++;
        spouseA.move(pos);
      } else if (spouseB.opacity === 0) {
        const pos = horiz
          ? new go.Point(v.x, v.centerY - spouseA.actualBounds.height / 2)
          : new go.Point(v.centerX - spouseA.actualBounds.width / 2, v.y);
        spouseA.move(pos);
        if (horiz) pos.y++; else pos.x++;
        spouseB.move(pos);
      }
      lablink.ensureBounds();
    });
  }

  findParentsMarriageLabelNode(node) {
    const it = node.findNodesInto();
    while (it.next()) {
      const n = it.value;
      if (n.isLinkLabel) return n;
    }
    return null;
  }
} // end GenogramLayout class


  function init() {

    const $ = go.GraphObject.make;
    

    myDiagram =
      new go.Diagram("myDiagramDiv",
        {
          "animationManager.isEnabled": false,
          initialViewportSpot: go.Spot.Top,
          initialDocumentSpot: go.Spot.Top,
          initialPosition: new go.Point(600,150),
          initialAutoScale: go.Diagram.UniformToFill,
          "undoManager.isEnabled": true,
          maxSelectionCount: 1,
          // when a node is selected, draw a big yellow circle behind it
          nodeSelectionAdornmentTemplate:
            $(go.Adornment, "Auto",
              { layerName: "Grid" },  // the predefined layer that is behind everything else
              $(go.Shape, "Circle", { fill: "#c1cee3", stroke: null }),
              $(go.Placeholder, { margin: 2 })
            ),
          layout:  // use a custom layout, defined above
            $(GenogramLayout, { direction: 90, layerSpacing: 30, columnSpacing: 10 }),
            
        });



    // two different node templates, one for each sex,
    // named by the category value in the node data object
    myDiagram.nodeTemplateMap.add("M",  // male
      $(go.Node, "Vertical",
        { locationSpot: go.Spot.Center, locationObjectName: "ICON",
          selectionObjectName: "ICON",
          contextMenu:  $(go.Adornment, "Vertical",
          $("ContextMenuButton",
          //define properties of the context menu      
          $(go.TextBlock,"Add Female Member"),
          //upon click call this function
          { click: addFemale}
        )
        )// end adornment
      },// end node properties
        
        new go.Binding("opacity", "hide", h => h ? 0 : 1),
        new go.Binding("pickable", "hide", h => !h),
        
      $(go.Panel,
        { name: "ICON" },
        $(go.Shape, "Rectangle",
          { width: 90, height: 90, strokeWidth: 2, fill: "white", stroke: "#919191", portId: "" }),
          $(go.Picture,
            {
              name: "Picture",
              width: 90,
              height:90,
              source: "pictures/default.jpg" 
            },
            new go.Binding("source", "pic"),
            ),// end picture inside panel
          ), //end panel
      $(go.TextBlock,
      { textAlign: "center", maxSize: new go.Size(100, NaN), background: "rgba(255,255,255,0.5)" },
      new go.Binding("text", "n")),
      $(go.TextBlock,
        { textAlign: "center", maxSize: new go.Size(100, NaN), background: "rgba(255,255,255,0.5)" },
        new go.Binding("text", "dob")),
      $(go.TextBlock,
        { textAlign: "center", maxSize: new go.Size(100, NaN), background: "rgba(255,255,255,0.5)" },
        new go.Binding("text", "dod")
      ),  

      
      ), // end node properties
    );
    
    //start of female node template
    myDiagram.nodeTemplateMap.add("F",  // female
      $(go.Node, "Vertical",
        { locationSpot: go.Spot.Center, locationObjectName: "ICON",
          selectionObjectName: "ICON",
          contextMenu:  $(go.Adornment, "Vertical",
          $("ContextMenuButton",
          //define properties of the context menu      
          $(go.TextBlock,"Add Female Member"),
          //upon click call this function
          { click: addFemale}
        )
        )// end adornment 

      },
        new go.Binding("opacity", "hide", h => h ? 0 : 1),
        new go.Binding("pickable", "hide", h => !h),
        
        $(go.Panel,
          { name: "ICON" },
          $(go.Shape, "Rectangle",
            { width: 90, height: 90, strokeWidth: 2, fill: "white", stroke: "#919191", portId: "" }),
            $(go.Picture,
              {
                name: "Picture",
                width: 90,
                height:90,
                source: "pictures/default.jpg" 
              },
              new go.Binding("source", "pic"),
        ),  // end picture
        
        ),//end panel
        $(go.TextBlock,
          {textAlign: "center", maxSize: new go.Size(80, NaN), background: "rgba(255,255,255,0.5)" },
          new go.Binding("text", "n")),
          $(go.TextBlock,
            { textAlign: "center", maxSize: new go.Size(80, NaN), background: "rgba(255,255,255,0.5)" },
            new go.Binding("text", "dob")),
          $(go.TextBlock,
            { textAlign: "center", maxSize: new go.Size(80, NaN), background: "rgba(255,255,255,0.5)" },
            new go.Binding("text", "dod")
          ),  
        
      )); //end template

     var counter = 41; //initial key starting num
     function generateUniqueKey(){
        var key = counter;
        counter++;
        return key;
     }


     
     
     
     let nextFunctionExecute = false;


    // the representation of each label node -- nothing shows on a Marriage Link
    myDiagram.nodeTemplateMap.add("LinkLabel",
      $(go.Node,
        { selectable: false, width: 1, height: 1, fromEndSegmentLength: 20 }));

    myDiagram.linkTemplate =  // for parent-child relationships
      $(go.Link,
        { routing: go.Link.Orthogonal, corner: 10, curviness: 15, 
          layerName: "Background", selectable: false },
        $(go.Shape, { stroke: "gray", strokeWidth: 2 })
      );

    myDiagram.linkTemplateMap.add("Marriage",  // for marriage relationships
      $(go.Link,
        // AvoidsNodes routing might be better when people have multiple marriages
        { routing: go.Link.AvoidsNodes, corner: 10,
          fromSpot: go.Spot.LeftRightSides, toSpot: go.Spot.LeftRightSides,
          selectable: false, isTreeLink: false, layerName: "Background" },
        $(go.Shape, { strokeWidth: 2.5, stroke: "#5d8cc1" /* blue */ })
      ));

      myDiagram.linkTemplateMap.add("Divorce",  // for Divorced with childeren relationships
      $(go.Link,
        // AvoidsNodes routing might be better when people have multiple marriages
        { routing: go.Link.AvoidsNodes, corner: 10,
          fromSpot: go.Spot.LeftRightSides, toSpot: go.Spot.LeftRightSides,
          selectable: false, isTreeLink: false, layerName: "Background" },
        $(go.Shape, { strokeWidth: 2.5, stroke: "#FF0000" /* red */ })
      ));

    // n: name, s: sex, m: mother, f: father, ux: wife, vir: husband, a: attributes/markers, fx:divorced partner with kids from husband POV
    // virf: divorced w/ kids from wife pov
    // to change the layer of where a node is on a hierarchy (parent/child) remove the
    // attribute that puts them there (remove a father to an existing node and it wont be a child node anymroe)
    // if certain attributes IE marriage dont apply to a node, just dont add it
    
  
      
    getJsonFile('/start-up')
    // .then runs when the file request is resolved
    .then(nodeDataArray =>{
      setupDiagram(myDiagram, nodeDataArray );
    })
    
    myDiagram.requestUpdate();
    
  
}; //end of init

  //function for parents
     // e means its an event, obj will be the clicked node
     function addFemale(e, obj){
      var curNode = obj.part.data;
      var newNodeKey = generateUniqueKey();
      var fullName = prompt('Enter their name:');
      var dob = prompt('Enter date of birth MM-DD-YYYY:');
      var dod = prompt('Enter date of death if applicable MM-DD-YYYY: ');
      var s = "F"
    
      // check if dob/dod has any value
      if (!dod) {
        dod = null;
      }
      
      if (!dob){
        dob = null;
      }
      var newNode = {
        key: newNodeKey,
        n: fullName,
        dob: dob,
        dod: dod,
        s: s
      }
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "/", true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onreadystatechange = function(){
        if (xhr.readyState === 4 && xhr.status === 200){
          var response = JSON.parse(xhr.responseText); //getting json info back
          //convert it to an array here
          console.log(response);
          var updatedArray = response;

      
          setupDiagram(myDiagram, updatedArray);
      }
    };

    
    var jsonData = JSON.stringify(newNode)
      
    xhr.send(jsonData);
    };




  //function here to convert the flat file to a js array which will be called in setUpDiagram
  // this will also show the up to date array everytime the website loads
  function getJsonFile(apiEndpoint){
      return fetch(apiEndpoint)
      .then(response => response.json())
      .then(jsonData => {
        const nodeDataArray = jsonData.nodeDataArray.map(item =>{
          return{
            key: item.key,
            n: item.n,
            s: item.s,
            pic: item.pic,
            ux: item.ux,
            vir: item.vir,
            dob: item.dob,
            dod: item.dod,
            m:item.m,
            f:item.f,
            virf: item.virf,
            fx: item.fx
          };
        })
        return nodeDataArray;
      })
  
}


  // create and initialize the Diagram.model given an array of node data representing people
  function setupDiagram(diagram, array, focusId) {
    
  
    diagram.model =
      new go.GraphLinksModel(
        { // declare support for link label nodes
          linkLabelKeysProperty: "labelKeys",
          // this property determines which template is used
          nodeCategoryProperty: "s",
          // if a node data object is copied, copy its data.a Array
          copiesArrays: true,
          // create all of the nodes for people
          nodeDataArray: array
        });
    setupMarriages(diagram);
    setupParents(diagram);
    setupDivorce(diagram);

    const node = diagram.findNodeForKey(focusId);
    if (node !== null) node.isSelected = true;
  }

  function findMarriage(diagram, a, b) {  // A and B are node keys
    const nodeA = diagram.findNodeForKey(a);
    const nodeB = diagram.findNodeForKey(b);
    if (nodeA !== null && nodeB !== null) {
      const it = nodeA.findLinksBetween(nodeB);  // in either direction
      while (it.next()) {
        const link = it.value;
        // Link.data.category === "Marriage" means it's a marriage relationship
        if (link.data !== null && link.data.category === "Marriage") return link;
      }
    }
    return null;
  }
  function findDivorce(diagram, a, b) {  // A and B are node keys
    const nodeA = diagram.findNodeForKey(a);
    const nodeB = diagram.findNodeForKey(b);
    if (nodeA !== null && nodeB !== null) {
      const it = nodeA.findLinksBetween(nodeB);  // in either direction
      while (it.next()) {
        const link = it.value;
        // Link.data.category === "Divorce" means it's a Divorce relationship
        if (link.data !== null && link.data.category === "Divorce") return link;
      }
    }
    return null;
  }
  

  // now process the node data to determine marriages
  function setupMarriages(diagram) {
    const model = diagram.model;
    const nodeDataArray = model.nodeDataArray;
    for (let i = 0; i < nodeDataArray.length; i++) {
      const data = nodeDataArray[i];
      const key = data.key;
      let uxs = data.ux;
      if (uxs !== undefined) {
        if (typeof uxs === "number") uxs = [uxs];
        for (let j = 0; j < uxs.length; j++) {
          const wife = uxs[j];
          const wdata = model.findNodeDataForKey(wife);
          if (key === wife || !wdata || wdata.s !== "F") {
            console.log("cannot create Marriage relationship with self or unknown person " + wife);
            continue;
          }
          const link = findMarriage(diagram, key, wife);
          if (link === null) {
            // add a label node for the marriage link
            const mlab = { s: "LinkLabel" };
            model.addNodeData(mlab);
            // add the marriage link itself, also referring to the label node
            const mdata = { from: key, to: wife, labelKeys: [mlab.key], category: "Marriage" };
            model.addLinkData(mdata);
          }
        }
      }
      let virs = data.vir;
      if (virs !== undefined) {
        if (typeof virs === "number") virs = [virs];
        for (let j = 0; j < virs.length; j++) {
          const husband = virs[j];
          const hdata = model.findNodeDataForKey(husband);
          if (key === husband || !hdata || hdata.s !== "M") {
            console.log("cannot create Marriage relationship with self or unknown person " + husband);
            continue;
          }
          const link = findMarriage(diagram, key, husband);
          if (link === null) {
            // add a label node for the marriage link
            const mlab = { s: "LinkLabel" };
            model.addNodeData(mlab);
            // add the marriage link itself, also referring to the label node
            const mdata = { from: key, to: husband, labelKeys: [mlab.key], category: "Marriage" };
            model.addLinkData(mdata);
          }
        }
      }
    }
    console.log("End of setupMarriage");
  }

  function setupDivorce(diagram) {
    const model = diagram.model;
    const nodeDataArray = model.nodeDataArray;
    for (let i = 0; i < nodeDataArray.length; i++) {
      const data = nodeDataArray[i];
      const key = data.key;
      let fxs = data.fx;
      if (fxs !== undefined) {
        if (typeof uxs === "number") fxs = [fxs];
        for (let j = 0; j < fxs.length; j++) {
          const wife = fxs[j];
          const wdata = model.findNodeDataForKey(wife);
          if (key === wife || !wdata || wdata.s !== "F") {
            console.log("cannot create Divorce relationship with self or unknown person " + wife);
            continue;
          }
          const link = findDivorce(diagram, key, wife);
          if (link === null) {
            // add a label node for the divorce link
            const mlab = { s: "LinkLabel" };
            model.addNodeData(mlab);
            // add the divorce link itself, also referring to the label node
            const mdata = { from: key, to: wife, labelKeys: [mlab.key], category: "Divorce" };
            model.addLinkData(mdata);
          }
        }
      }
      let virsf = data.virf;
      if (virsf !== undefined) {
        if (typeof virsf === "number") virsf = [virsf];
        for (let j = 0; j < virsf.length; j++) {
          const husband = virsf[j];
          const hdata = model.findNodeDataForKey(husband);
          if (key === husband || !hdata || hdata.s !== "M") {
            console.log("cannot create Divorce relationship with self or unknown person " + husband);
            continue;
          }
          const link = findDivorce(diagram, key, husband);
          if (link === null) {
            // add a label node for the marriage link
            const mlab = { s: "LinkLabel" };
            model.addNodeData(mlab);
            // add the marriage link itself, also referring to the label node
            const mdata = { from: key, to: husband, labelKeys: [mlab.key], category: "Divorce" };
            model.addLinkData(mdata);
          }
        }
      }
    }
    console.log("End of setupDivorce");
  }

 

  // process parent-child relationships once all marriages are known
  function setupParents(diagram) {
    const model = diagram.model;
    const nodeDataArray = model.nodeDataArray;
    for (let i = 0; i < nodeDataArray.length; i++) {
      const data = nodeDataArray[i];
      const key = data.key;
      const mother = data.m;
      const father = data.f;
      if (mother !== undefined && father !== undefined) {
        const link = findMarriage(diagram, mother, father);
        if (link === null) {
          // or warn no known mother or no known father or no known marriage between them
          console.log("unknown marriage: " + mother + " & " + father);
          continue;
        }
        const mdata = link.data;
        if (mdata.labelKeys === undefined || mdata.labelKeys[0] === undefined) continue;
        const mlabkey = mdata.labelKeys[0];
        const cdata = { from: mlabkey, to: key };
        myDiagram.model.addLinkData(cdata);
      }
    }
    console.log("End of setupParents");
  }

  window.addEventListener('DOMContentLoaded', init);