import { Component, OnInit, ElementRef, ViewChild, TemplateRef, ViewContainerRef } from '@angular/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { NgForm } from "@angular/forms";
import cytoscape from 'cytoscape';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent implements OnInit {

  cy;
  public modalRef: BsModalRef;
  nodeIdField;
  durationField;
  activityTypeField;
  initialNodeField;
  selectedActivity;
  selectedEdge;
  finalNodeField;

  maxDuration: number;

  tableCols: number[];
  tableRows: any[];
  showContainers: boolean;
  solved: boolean;
  ratio: number;
  criticalId: any[];
  nodes: any[];
  edges: any[];
  endResult: any[];
  forwardMap: Map<any, any>;
  backwardMap: Map<any, any>;

  @ViewChild('results') modalTemplate: TemplateRef<any>;

  constructor(private modalService: BsModalService) { }

  /**
   * Allows modals to pop up
   * @param template 
   */
  public openModal(template: TemplateRef<any>) {
    if (template == this.modalTemplate) {
      this.modalRef = this.modalService.show(template, { class: 'modal-lg' });
    }
    else {
      this.modalRef = this.modalService.show(template);
    }
  }

  /**
   * Get the values of the add format
   * @param form 
   */
  submitAddForm(form: NgForm) {
    var field :string= form.value.nodeIdField;
    var split:Array<string> = field.split(';');
    var duration :number= Number.parseInt(split[1]);
    console.log(duration)
    if(isNaN(duration)){
      console.log('in');
      document.getElementById('alertBadFormat').className = "text-danger"
    }
    else {
      this.addActivity(split[0], Number.parseInt(split[1]), 'intermediate');
      this.modalRef.hide();
    }
    form.reset();
  }

  submitEditForm(form: NgForm) {
    this.editNode(form.value.selectedActivity, form.value.durationField)
    this.modalRef.hide();
    form.reset();
  }

  /**
   * Get the values of the precedence modal
   * @param form 
   */
  submitPrecedenceForm(form: NgForm) {
    this.addEdge(form.value.initialNodeField, form.value.finalNodeField);
    this.modalRef.hide();
    form.reset();
  }

  ngOnInit(): void {
    this.solved = false;
    this.ratio = 1;
    this.showContainers = false;
    this.forwardMap = new Map();
    this.backwardMap = new Map();
    this.nodes = [
    ];
    this.edges = [
    ]

    this.cy = cytoscape({

      container: document.getElementById('cy'),

      elements: {
        nodes: this.nodes,
        edges: this.edges,
      },
      // list of graph elements to start with
      style: [ // the stylesheet for the graph
        {
          selector: 'node',
          style: {
            'background-color': '#666',
            'label': 'data(label)',
            'text-wrap': 'wrap'
          }
        },

        {
          selector: 'edge',
          style: {
            'width': 3,
            'line-color': '#ccc',
            'target-arrow-color': '#ccc',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          }
        }
      ],
      layout: {
        name: 'null',
      }
    });
    this.addActivity('inicio', 0, 'initial');
    this.addActivity('fin', 0, 'final');
    var height = window.innerHeight - 110
    document.getElementById('cy').style.height = height + "px";
    this.cy.resize();
    this.cy.zoomingEnabled(false)
  }

  /*
   * Node Structure Goes:
   * id: identificator, allows cy.$id() to get called
   * duration: Length of the activity
   * minStart: minimun instant where the activity can start
   * lateStart: maximum instant where the activity can start
   * minEnd: minimun instant where the activity can end
   * lateEnd: maximum instant where the activity can end
   * 
   * if both start and end duration are the same, the node is part of the critical route
   *   
   */

  /**
   * Method to calculate the minimum start and end of an activity
   * @param currentNode Node that is being evaluated
   * @param adjNodes Nodes that inmediatly preceed the currentNode
   */
  calcMinStartAndEnd(currentNode, adjNodes) {
    var currentNodeDuration = currentNode._private.data.duration;
    var currentMin = adjNodes[0]._private.data.minEnd + currentNodeDuration;
    var minStart = adjNodes[0]._private.data.minEnd;
    for (let i = 0; i < adjNodes.length; i++) {
      var adjNode = adjNodes[i];
      if (adjNode._private.data.minEnd != undefined) {
        var adjEnd = adjNode._private.data.minEnd;
        var tempMinEnd = currentNodeDuration + adjEnd;
        if (tempMinEnd > currentMin) {
          currentMin = tempMinEnd;
          minStart = adjEnd;
        }
      } else {
        console.log(adjNode._private.data.id);
        var notCalc = this.backwardMap.get(adjNode._private.data.id);
        console.log(notCalc);
        var newAdj = this.cy.$id(notCalc);
        return this.calcMinStartAndEnd(currentNode, this.calcMinStartAndEnd(adjNode, newAdj));
      }

    }
    currentNode.data({ minStart: minStart, minEnd: currentMin });
    if (currentNode._private.data.isEnd) {
      currentNode.data({ lateStart: minStart, lateEnd: currentMin });
      this.maxDuration = currentMin;
    }
    return currentNode;
  }

  /**
   * Method to calculate the latest start and end of an activity
   * @param currentNode Node that is being evaluated
   * @param adjNodes Nodes that inmediatly proceed the currentNode
   */
  calcLateStartAndEnd(currentNode, adjNodes) {
    var currentNodeDuration = currentNode._private.data.duration;
    var currentLate;
    var minStart;
    if (adjNodes instanceof Array) {
      currentLate = adjNodes[0]._private.data.lateStart;
      minStart = currentLate - currentNodeDuration;
      for (let i = 0; i < adjNodes.length; i++) {
        var adjNode = adjNodes[i];
        var adjEnd = adjNode._private.data.lateStart;
        var tempLateEnd = adjEnd - currentNodeDuration;
        if (adjEnd < currentLate) {
          currentLate = adjEnd;
          minStart = tempLateEnd;
        }
      }
    } else {
      currentLate = adjNodes._private.data.lateStart;
      minStart = currentLate - currentNodeDuration;
    }
    if (currentNode._private.data.isStart) {
      currentNode.data({ lateStart: 0, lateEnd: 0 });
    }
    else {
      currentNode.data({ lateStart: minStart, lateEnd: currentLate });
      this.endResult.push(currentNode._private.data);
    }
    return currentNode;
  }

  /**
   * Add activity node to the graph
   * @param idGiven // Id of the node
   * @param durationGiven // Duration of the activity
   * @param type // Determines if its the first, n or last activity of the graph, alows some computations
   */
  addActivity(idGiven, durationGiven, type) {
    var minStartCalc;
    var minEndCalc;
    var node;
    var labelMade: string = idGiven + "\n" + durationGiven;
    switch (type) {
      case 'initial':
        minStartCalc = 0;
        minEndCalc = durationGiven;
        var labelMade: string = idGiven + "\n" + 0;
        node = { data: { id: idGiven, duration: 0, minStart: 0, minEnd: 0, isEnd: false, isStart: true, label: labelMade } };
        break;
      case 'intermediate':
        var labelMade: string = idGiven + "\n" + durationGiven;
        node = { data: { id: idGiven, duration: durationGiven, isEnd: false, isStart: false, label: labelMade } };
        break;
      case 'final':
        var labelMade: string = idGiven + "\n" + 0;
        node = { data: { id: idGiven, duration: 0, isEnd: true, isStart: false, label: labelMade } };
        break;
    }
    var data = node.data;
    this.nodes.push(node);
    this.cy.add({ group: 'nodes', data });
    this.cy.$id(idGiven).position({ x: 50 * this.ratio, y: 50 });
    this.ratio++;

  }

  editNode(idGiven, durationGiven) {
    var node;
    var labelMade: string = idGiven + "\n" + durationGiven;
    node = { data: { id: idGiven, duration: durationGiven, isEnd: false, isStart: false, label: labelMade } };
    let currentNode = this.cy.$id(idGiven);
    currentNode.data(node.data);
    var index = this.nodes.findIndex((item) => item.data.id == idGiven);
    this.nodes[index] = node;
    if (this.solved) {
      this.cy.edges().style({'line-color': '#ccc',
      'target-arrow-color': '#ccc',});
      this.showContainers = false;
      this.solvePert();
    }
  }

  /**
   * Add a edge between 2 given nodes
   * @param final node where the edge ends
   * @param inital node where the edge starts
   */
  addEdge(final, inital) {
    var idEdge: String = inital + final;
    var edge = { data: { id: idEdge, source: inital, target: final, position: { x: 200, y: 200 } } };
    var data = edge.data;
    this.cy.add({ group: 'edges', data });
    this.edges.push(edge);
  }

  /**
   * Checks the values of the given key and makes an array with them if its not 
   * empty, allowing the adjacency list to be made
   * @param keyMap key of the map 
   * @param valueMap value thats going to be added to the map
   */
  checkIfNodeIsOnForwardMap(keyMap, valueMap) {
    if (this.forwardMap.has(keyMap.data.id)) {
      var arr: any[] = [];
      if (this.forwardMap.get(keyMap.data.id) instanceof (Array)) {
        arr = this.forwardMap.get(keyMap.data.id);
      } else {
        arr.push(this.forwardMap.get(keyMap.data.id));
      }
      arr.push(valueMap.data.id);
      this.forwardMap.set(keyMap.data.id, arr);
    } else {
      this.forwardMap.set(keyMap.data.id, valueMap.data.id);
    }
  }

  /**
   * Checks the values of the given key and makes an array with them if its not 
   * empty, allowing the adjacency list to be made
   * @param keyMap key of the map 
   * @param valueMap value thats going to be added to the map
   */
  checkIfNodeIsOnBackwardMap(keyMap, valueMap) {
    if (this.backwardMap.has(keyMap.data.id)) {
      var arr: any[] = [];
      if (this.backwardMap.get(keyMap.data.id) instanceof (Array)) {
        arr = this.backwardMap.get(keyMap.data.id);
      } else {
        arr.push(this.backwardMap.get(keyMap.data.id));
      }
      arr.push(valueMap.data.id);
      this.backwardMap.set(keyMap.data.id, arr);
    } else {
      this.backwardMap.set(keyMap.data.id, valueMap.data.id);
    }
  }

  /**
   * Solves the graph by calculating the min and max values for the
   * start and end of an activity.
   * 
   * SR: The arrays are used to alow a correct execution of the path that is going 
   * to be calculated, maybe there is a better way to do that, so i will revisit 
   * this code on another ocation. 
   * 
   */
  solvePert() {
    this.maxDuration = 0;
    this.solved = true;
    this.tableCols = [];
    this.tableRows = [];
    this.endResult = [];
    this.criticalId = [];

    this.makeBackwardAdjacencyList();
    var keysWithLastEnd: any[] = new Array();
    var lastElement;
    for (let [keyNode, values] of this.backwardMap.entries()) {
      let currentNode = this.cy.$id(keyNode);
      if (currentNode._private.data.isEnd) {
        lastElement = currentNode;
      }
      else {
        keysWithLastEnd.push(currentNode);
      }
    }

    keysWithLastEnd.push(lastElement);

    for (let index = 0; index < keysWithLastEnd.length; index++) {
      let currentNode = keysWithLastEnd[index];
      let values = this.backwardMap.get(currentNode._private.data.id);
      if (values instanceof Array) {
        let adjNodes = [];
        for (let i = 0; i < values.length; i++) {
          let tempNode = this.cy.$id(values[i]);
          adjNodes.push(tempNode);
        }
        currentNode = this.calcMinStartAndEnd(currentNode, adjNodes);
      } else {
        let tempNode = this.cy.$id(values);
        currentNode = this.calcMinStartAndEnd(currentNode, tempNode);
      }
    }
    /*
        for (let [key, val] of this.backwardMap) {
          let currentNode = this.cy.$id(key);
          let values = val;
          if (values instanceof Array) {
            let adjNodes = [];
            for (let i = 0; i < values.length; i++) {
              let tempNode = this.cy.$id(values[i]);
              adjNodes.push(tempNode);
            }
            currentNode = this.calcMinStartAndEnd(currentNode, adjNodes);
          } else {
            let tempNode = this.cy.$id(values);
            currentNode = this.calcMinStartAndEnd(currentNode, tempNode);
          }
        }
    */

    this.makeForwardAdjacencyList();
    var keys: any[] = new Array(this.forwardMap.size);
    var sortedKeys: any[] = new Array();
    var iterator = (this.forwardMap.size) - 1;
    for (let [keyNode, values] of this.forwardMap.entries()) {
      keys[iterator] = keyNode;
      iterator--;
    }

    for (let i = 0; i < keys.length; i++) {
      let currentNode = this.cy.$id(keys[i]);
      sortedKeys.push(currentNode);
    };

    sortedKeys.sort(function (a, b) {
      return b._private.data.minEnd - a._private.data.minEnd;
    });

    for (let j = 0; j < sortedKeys.length; j++) {
      let currentNode = sortedKeys[j];
      let vals = this.forwardMap.get(currentNode._private.data.id);
      if (vals instanceof Array) {
        let adjNodes = [];
        for (let k = 0; k < vals.length; k++) {
          let tempNode = this.cy.$id(vals[k]);
          adjNodes.push(tempNode);
        }
        currentNode = this.calcLateStartAndEnd(currentNode, adjNodes);
      } else {
        let tempNode = this.cy.$id(vals);
        currentNode = this.calcLateStartAndEnd(currentNode, tempNode);
      }
    }

    this.endResult.sort((a, b) => b.id.toLowerCase() > a.id.toLowerCase() ? -1 : 1);

    var longestDuration = this.maxDuration;
    var j = 0
    console.log(this.endResult);
    this.endResult.forEach((node) => {
      var minStart = node.minStart;
      var minEnd = node.minEnd;
      var lateStart = node.lateStart;
      this.tableRows[j] = Array(longestDuration).fill(0);
      this.tableRows[j + 1] = Array(longestDuration).fill(0);
      var lateEnd = node.lateEnd;
      this.tableRows[j] = Array(longestDuration).fill(1, minStart, minEnd);
      this.tableRows[j + 1] = Array(longestDuration).fill(1, lateStart, lateEnd);
      j += 2;
    })

    this.tableCols = Array(longestDuration).fill(0).map((x, i) => i);
    this.calcCriticalRoute(this.endResult);
    this.showContainers = true;

  }

  /**
   * Gets the critical route, and paints it in the graph
   * @param result 
   */
  calcCriticalRoute(result: any[]) {
    result.forEach((node) => {
      if (node.minStart == node.lateStart)
        this.criticalId.push(node.id);
    })
    for (let i = 0; i < this.criticalId.length; i++) {
      if (i == this.criticalId.length - 1) {
        var edgeId: String = this.criticalId[i] + this.criticalId[0];
        var edge = this.cy.edges("[id = '" + edgeId + "']");
        edge = edge.style({ 'line-color': 'red', 'target-arrow-color': 'red' });
      }
      else {
        var edgeId: String = this.criticalId[i] + this.criticalId[i + 1];
        var edge = this.cy.edges("[id = '" + edgeId + "']");
        edge = edge.style({ 'line-color': 'red', 'target-arrow-color': 'red' });
      }
    }
    for (let i = 0; i < this.criticalId.length; i++) {
      var startEdgeName: string = 'inicio' + this.criticalId[i];
      var startEdge = this.cy.edges("[id = '" + startEdgeName + "']");
      var endEdgeName: string = this.criticalId[i] + 'fin';
      var endEdge = this.cy.edges("[id = '" + endEdgeName + "']");
      if (startEdge != undefined) {
        startEdge = startEdge.style({ 'line-color': 'red', 'target-arrow-color': 'red' });
      }
      if (endEdge != undefined) {
        endEdge = endEdge.style({ 'line-color': 'red', 'target-arrow-color': 'red' });
      }
    }
  }

  deleteNode(form) {
    var nodeId = form.value.selectedActivity
    var node = this.cy.$id(nodeId);
    var data;
    this.nodes.forEach((item) => {
      if (item.data.id == nodeId) {
        data = item;
      }
    }
    )
    const index = this.nodes.indexOf(data, 0);
    if (index > -1) {
      this.nodes.splice(index, 1);
    }
    var edgesSource = this.cy.edges("[source = '" + nodeId + "']");
    var edgeTarget = this.cy.edges("[target = '" + nodeId + "']");
    for (let [key, val] of edgesSource._private.map.entries()) {
      var data;
      this.edges.forEach((item) => {
        if (item.data.id == key) {
          data = item;
        }
      })
      const index = this.edges.indexOf(data, 0);
      if (index > -1) {
        this.edges.splice(index, 1);
      }
    }
    for (let [key, val] of edgeTarget._private.map.entries()) {
      var data;
      this.edges.forEach((item) => {
        if (item.data.id == key) {
          data = item;
        }
      })
      const index = this.edges.indexOf(data, 0);
      if (index > -1) {
        this.edges.splice(index, 1);
      }
    }
    this.cy.remove(node);
    this.cy.remove(edgesSource);
    this.cy.remove(edgeTarget);
  }

  deleteEdge(form) {
    var edgeId = form.value.selectedEdge
    var edge = this.cy.edges("[id = '" + edgeId + "']")
    for (let [key, val] of edge._private.map.entries()) {
      var data;
      var initialNode;
      var finalNode;
      this.edges.forEach((item) => {
        if (item.data.id == key) {
          data = item;
          initialNode = item.data.source;
          finalNode = item.data.target;
        }
      })
      const index = this.edges.indexOf(data, 0);
      if (index > -1) {
        this.edges.splice(index, 1);
      }
    }
    //back final,inital
    this.cy.remove(edge);
  }

  makeBackwardAdjacencyList() {
    this.backwardMap = new Map<any,any>();
    this.nodes.forEach((node) => {
      var currentNode = this.cy.$id(node.data.id)._private
      var startEdge: Map<any, any> = this.cy.edges("[target = '" + node.data.id + "']")._private.map;
      for (let [key, val] of startEdge.entries()) {
        var adjacentNode = this.cy.$id(val.ele._private.data.source)._private
        this.checkIfNodeIsOnBackwardMap(currentNode, adjacentNode);
      }
    })
  }

  makeForwardAdjacencyList() {
    this.forwardMap = new Map<any,any>();
    this.nodes.forEach((node) => {
      var currentNode = this.cy.$id(node.data.id)._private
      var startEdge: Map<any, any> = this.cy.edges("[source = '" + node.data.id + "']")._private.map;
      for (let [key, val] of startEdge.entries()) {
        var adjacentNode = this.cy.$id(val.ele._private.data.target)._private
        this.checkIfNodeIsOnForwardMap(currentNode, adjacentNode);
      }
    })
    console.log('***back***');
    console.log(this.backwardMap);
    console.log('***for***');
    console.log(this.forwardMap);

  }
}
