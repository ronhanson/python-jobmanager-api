/*
Job Manager API
Logs Live Page JS
@author Ronan Delacroix
*/

(function($){

    $(document).ready(function() {
        var filters_data = null;
        var timestamp_val = null;
        var timer = null;
        var container = $('#container');
        var follow_checkbox = $('#follow_checkbox');
        var refresh_rate = $('#refresh_rate');
        var commands_input = $("#commands input");
        var additional_filters_button = $("#additional_filters_button");
        var filters_button = $("#filters button");
        var filters_input = $("#filters input");
        var log_format_template = _.template('<%= timestamp %> <%= hostname %>');


        function update_log_format_template() {
            var log_format = $("#log_format").val();
            var processed_log_format = log_format;
            _.each(_.uniq(log_format.split(' ')), function(elem) {
                if (elem.length>2) {
                    processed_log_format = processed_log_format.replace(elem, '<% if (!_.isUndefined(arguments[0].'+elem+')) { %><span data-element="'+elem+'" title="'+elem+'"><%- '+elem+' %></span><% } %>');
                }
            });
            processed_log_format += " - <%- message %>";
            log_format_template = _.template(processed_log_format);
        }

        function on_log_format_change() {
            update_log_format_template();
            refresh_data();
        }

        function on_log_element_click() {
            var that = $(this);
            var element = that.data('element');
            var corresponding_input = $("#additional_filters_row input[name='"+element+"']");
            if (corresponding_input.length>0) {
                corresponding_input.val(that.text());
                refresh_data();
            }

        }

        function on_input_change() {
            localStorage.setItem("commands_"+($(this).attr('name')), $(this).val());
        }

        function on_additional_click() {
             $("#additional_filters_row").toggle();
             localStorage.setItem("commands_additional", $("#additional_filters_row").is(":visible"));
        }

        function init_form() {
            $.each(commands_input, function() {
                var saved_value = localStorage.getItem("commands_"+($(this).attr('name')));
                if (saved_value && ($(this).val()=="" || this.id == "log_format")) {
                    $(this).val(saved_value);
                }
            });

            if (localStorage.getItem("commands_additional")=="true") {
                $("#additional_filters_row").show();
            }
        }

        function init_tooltip() {

            $('body').on('mouseenter', 'p span:not(.tooltipstered)', function(){
                var sides = ['bottom'];
                $(this).tooltipster({
                    plugins: ['sideTip'],
                    trigger: 'hover',
                    side: sides,
                    delay: 0,
                    contentAsHTML: true,
                    theme: 'tooltipster-borderless',
                    animation: 'raise'

                }).tooltipster('open');
            });
        }

        function set_data_from_form() {
            filters_data = {since:timestamp_val, limit:1000};
            var form_filter_data = $("#filters").serializeObject();
            $.each(form_filter_data, function(i, v) {
                if (v!==null && v!=="") {
                    filters_data[i]=v;
                }
            });
        }

        function get_log_data() {
            if (filters_data==null) {
                set_data_from_form();
            }
            filters_data.since = timestamp_val;
            $.getJSON('/logs/', filters_data, get_data_result);
        }

        function get_data_result(data) {

            clearTimeout(timer);
            timer = setTimeout(get_log_data, refresh_rate.val());

            $("#commands").removeClass('loading');//.css('opacity', '1.0');
            var new_data_found = false;
            if (data.length==0) {
                return;
            }
            var first_batch = (timestamp_val==null);
            timestamp_val = data[0].timestamp; //newest element
            oldest_timestamp = data[data.length-1].timestamp; //oldest element
            if (timestamp_val && !first_batch) {
                while (data.length && oldest_timestamp && data[data.length-1].timestamp == oldest_timestamp) {
                    data.pop(); // remove latest element that is always one that has already been queried.
                }
            }

            if (data.length>0) {
                new_data_found = true;
            }
            data = data.reverse();
            $.each(data, function(i, v) {
                container.append('<p class="new">'+log_format_template(v)+'</p>');
            });
            container.find("p.new").animate({opacity:1}, 500, "swing", function() {
                    $(this).removeClass('new');
                }
            );
            if (new_data_found && follow_checkbox.is(':checked')) {
                var ref_rate = refresh_rate.val()/2;
                if (ref_rate>2000) ref_rate=2000;
                $('html, body').animate({
                  scrollTop: $(document.body).height()
                }, ref_rate);
            }
        }

        function refresh_data() {
            clearTimeout(timer);
            $('html, body').stop().clearQueue();
            container.html('');
            timestamp_val=null;
            set_data_from_form();
            get_log_data();
            return false;
        }

        function reset_timer() {
            clearTimeout(timer);
            timer = setTimeout(get_log_data, refresh_rate.val());
            $('html, body').stop().clearQueue();
        }

        function style_list(ul_list) {
            var k=0;
            $.each($(ul_list).find('li'), function(i, val) {
                var li = $(val);
                if (li.css("display")!=='none') {
                    if (k%2==1) {
                        li.addClass('odd');
                    }
                    else {
                        li.removeClass('odd');
                    }
                    k=k+1;
                }
            });
        }

        function on_filters_input_keyup() {
            var input = $(this);
            var input_val = input.val();
            var ul_list = input.next('ul');
            $.each(ul_list.find('li'), function(i, val) {
                var li = $(val);

                if (li.html().indexOf(input_val) !== -1) {
                    li.show();
                } else {
                    li.hide();
                }
            });
            style_list(ul_list);
        }

        function on_filters_input_focusin() {
            var input = $(this);
            input.next('ul').remove();
            var name = $(this).attr('name');
            var ul = $("<ul class='input_select "+name+"'><li class='no-data' data-value=''><i class='fa fa-refresh fa-spin ul-loader'></i>&nbsp;Loading...&nbsp;</li></ul>");
            $(this).after(ul);
            $.getJSON('/logs/distinct/'+name, function(data) {
                ul.html('');
                $.each(data, function(i, el) {
                    ul.append('<li class="'+name+'" data-value="'+el[name]+'">'+el[name]+'</li>');
                });
                if (ul.html()=='' || input.val()!=="") {
                    ul.prepend('<li class="no-data" data-value=""><i class="fa fa-remove"></i></li>');
                }
                ul.find('li').on('click', function(el) {
                    input.val($(this).data('value'));
                    input.change();
                    $("#filters").change();
                    $("#commands").addClass('loading');//.css('opacity', '0.1');
                    refresh_data();
                });
                style_list(ul);
            });
        }

        function on_filters_input_focusout() {
            var that = this;
            $(that).next('ul').fadeOut(500);
        }

        init_form();

        init_tooltip();

        update_log_format_template();

        additional_filters_button.on('click', on_additional_click);
        commands_input.on('change', on_input_change);
        refresh_rate.on('change', reset_timer);
        $("#log_format").on('change', on_log_format_change);
        $("#container").on('click', "p span", on_log_element_click);

        get_log_data();
        //timer = setInterval(get_log_data, refresh_rate.val());

        filters_button.on('click', refresh_data);

        filters_input.on('focusin', on_filters_input_focusin);
        filters_input.on('focusout', on_filters_input_focusout);
        filters_input.on('keyup', on_filters_input_keyup);

    });
})(jQuery);