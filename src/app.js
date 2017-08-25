
window._ = window._ = require('lodash');
window.$ = window.jQuery = require('jquery');
require('bootstrap');
Vue = require('vue');
VueRouter = require('vue-router');

//components must be declared BEFORE the app
Vue.component('todo-item', {
  props: ['todo'],
  template: '<h2> <u>TODO</u> : {{ todo }}</h2>'
});


var app = new Vue({

  el: '#vue_app',

  data: {
    message: 'You loaded this page on ' + new Date().toLocaleString(),
    tooltip: 'This is when the page has been loaded for the last time',
    fruits: ['banana', 'apple', 'orange']
  },

  methods: {
     reverseMessage : function() {
         this.message = this.message.split('').reverse().join('');
     }
  }

});

alert('ici');


