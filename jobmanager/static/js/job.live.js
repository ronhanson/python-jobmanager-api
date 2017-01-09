/*
Job Manager API
Logs Live Page JS
@author Ronan Delacroix
*/

(function($){
    timer = null;
    job_template_compiled = null;
    clients = {};

    function get_job_data() {
        var job_uuid = $('#container').data('job_uuid');
        if (job_uuid) {
            $.getJSON('/job/'+job_uuid, {}, get_job_data_callback);
        }
        else {
            $.getJSON('/job/', {}, get_job_list_data_callback);
        }
    }

    function get_job_list_data_callback(data) {
        _.each(data.reverse(), function (job) {
            process_job_data(job);
        });
        clearTimeout(timer);
        timer = setTimeout(get_job_data, 2000);
    }

    function get_job_data_callback(data) {
        var _continue = true;
        try {
            _continue = process_job_data(data);
        } catch(e) {
            console.log('Error while processing job data.');
            console.log(e);
        }
        if (_continue) {
            clearTimeout(timer);
            timer = setTimeout(get_job_data, 2000);
        }
    }

    function process_job_data(job_data) {

        $("#commands").removeClass('loading');
        var job_dom = $("#"+job_data.uuid);

        if (job_dom.length==0) {

            var compiled = _.template($('#job_template').html());
            $("#container").prepend(compiled({job: job_data}));
            $("#"+job_data.uuid).removeClass('loading');
            job_dom = $("#"+job_data.uuid);
        }
        var _continue = update_job_data(job_dom, job_data);
        return _continue;
    }


    function gauge(element, data, label) {
        if (label==undefined) {label = data+'%'; }
        element.find('.percent').html(label);
        bar = element.find('.complete');
        bar.css('width', data+'%');
    }


    function update_job_data(job_dom, job_data) {
        var created = moment.utc(job_data.created);
        var finished = moment.utc(job_data.finished);
        var _now = moment.utc();

        var job_status = null;
        if (job_data.status=='success' || job_data.status=='error') {
            job_status = 'finished';
        }
        else {
            job_status = 'unfinished';
        }

        job_dom.removeClass('success error running pending').addClass(job_data.status);
        job_dom.find('.general .status i').removeClass('fa-play fa-refresh fa-spin fa-clock-o fa-check fa-exclamation');
        if (job_data.status=='success') {job_dom.find('.general .status i').addClass('fa-check');}
        if (job_data.status=='error') {job_dom.find('.general .status i').addClass('fa-exclamation');}
        if (job_data.status=='running') {job_dom.find('.general .status i').addClass('fa-refresh fa-spin');}
        if (job_data.status=='pending') {job_dom.find('.general .status i').addClass('fa-clock-o');}

        var completion = parseFloat(job_data.completion).toFixed(1);
        gauge(job_dom.find('.gauge'), completion,  completion + "% - " + job_data.status_text);

        job_running = job_dom.removeClass('unfinished finished').addClass(job_status);
        job_running_since = job_dom.find('.since').html(created.fromNow());
        job_dom.find('.since').attr( 'title', created.format('YYYY-MM-DD HH:mm:ss'));
        job_client_hostname = job_dom.find('.client_hostname').html(job_data.client_hostname);
        job_client_hostname = job_dom.find('.client_uuid').html(job_data.client_uuid);
        job_client_log_button = job_dom.find('.client_logs').data('client_uuid', job_data.client_uuid);

        job_running_for = job_dom.find('.for').html(finished.diff(created, 'hours', true).toFixed(1)+' hours');
        job_dom.find('.for').attr( 'title', moment.duration(finished.diff(created)).format("HH [hrs] mm [min] ss.SSS [sec] "));
        if (job_data.details) {
            job_details = job_dom.find('.details pre').html(job_data.details+'\n');
            job_dom.find('.details_row').show('quick');
        } else {
            job_details = job_dom.find('.details_row').hide('quick');
        }

        if (job_status=='finished') {
            job_dom.find('.dates .stopped').html( 'Finished '+finished.fromNow()+'.');
            job_dom.find('.dates .stopped').attr( 'title', finished.format('YYYY-MM-DD HH:mm:ss'));
        }

        if (job_dom.find('.history table tr').length < job_data.history.length) {
            var i=1;
            var compiled =  _.template($('#hist_template').html());
            _.each(job_data.history, function(h) {
                if (job_dom.find('.history table #'+i).length==0) {
                    var row = compiled({h:h, i:i, job:job_data});
                    job_dom.find('.history table').append(row);
                }
                i = i+1;
            });
        }
        if (job_dom.find('.history table tr').length==0) {
            job_dom.find('.history_row').hide('quick');
        } else {
            job_dom.find('.history_row').show('quick');
        }
        return job_status=='unfinished';
    }

    function log_button_click_callback() {
        var that = this;
        $.magnificPopup.open({
            items: {
                src: '',
            },
            callbacks: {
                elementParse: function(item) {
                  item.src = '/logs/live?' + $.param($(that).data());
                  item.data.src = '/logs/live?' + $.param($(that).data());
                  console.log(item); // Do whatever you want with "item" object
                }
            },
            type: 'iframe',
        });
    }

    function commands_view_click_callback() {
        if ($('#container').hasClass('full-view')) {
            $('#container').removeClass('full-view').addClass('small-view');
            $("#commands").find('.fa').removeClass('fa-eye').addClass('fa-eye-slash');
			try { localStorage.setItem('view', 'small'); } catch(e) {}
        } else  {
            $('#container').removeClass('small-view').addClass('full-view');
            $("#commands").find('.fa').removeClass('fa-eye-slash').addClass('fa-eye');
			try { localStorage.setItem('view', 'full'); } catch(e) {}
			$.each(clients, function(id, c) {
			    c.last_update = null;
			});
        }
    }

    $(document).ready(function() {

        job_template_compiled = _.template($('#job_template').html());

        $("#commands").on('click', commands_view_click_callback);

        if (localStorage.getItem('view') == 'full') {
            $('#container').removeClass('small-view').addClass('full-view');
            $("#commands").find('.fa').removeClass('fa-eye-slash').addClass('fa-eye');
        }

        $('#container').on('click', '.logs.button', log_button_click_callback);

        get_job_data();

    });
})(jQuery);