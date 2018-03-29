/*
Job Manager API
Logs Live Page JS
@author Ronan Delacroix
*/

(function($){
    timer = null;

    $(document).ready(function() {

        if (localStorage.getItem('view') == 'full') {
            $('#container').removeClass('small-view').addClass('full-view');
            $("#commands").find('.fa').removeClass('fa-eye-slash').addClass('fa-eye');
        }

        //import moment from 'moment';

        Vue.prototype.moment = moment;

        Vue.component('host-item', {
          props: ['host'],
          template: '<li>{{ moment.utc() }} == {{ moment.utc(host.updated) }} {{ host.hostname }} since {{ moment.utc(host.created).from( moment.utc() ) }} for {{ moment.duration(moment.utc().diff( moment.utc(host.created))).humanize() }} </li>'
        });


        var app7 = new Vue({
          el: '#app-7',
          data: {
            hosts: [
              { id: 0, hostname: 'Vegetables' },
              { id: 1, hostname: 'Cheese' },
              { id: 2, hostname: 'Whatever else humans are supposed to eat' }
            ]
          }
        });

        function get_host_data() {

            $.getJSON('/host/', {alive:240}, get_host_data_callback);
        }

        function get_host_data_callback(data) {
            try {
                process_host_data(data);
            } catch(e) {
                console.log('Error while processing host data.');
                console.log(e);
            }
            clearTimeout(timer);
            timer = setTimeout(get_host_data, 2000);
        }

        function process_host_data(data) {

            $("#commands").removeClass('loading');
            app7.hosts = data;
        }

        get_host_data();


    });

})(jQuery);