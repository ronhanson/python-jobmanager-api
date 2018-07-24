#!/usr/bin/env python
# -*- coding: utf-8 -*-
# vim: ai ts=4 sts=4 et sw=4 nu
""" 
(c) 2015 Ronan Delacroix
Python Job Manager Server API
:author: Ronan Delacroix
"""
from flask import Flask, request, Response, render_template, url_for
from functools import wraps
import json
from flask.views import MethodView
import mongoengine.base.common
import mongoengine.errors
import mongoengine.connection
from jobmanager.common as common
from jobmanager.common.job import Job
from jobmanager.common.host import Host, HostStatus
import tbx
import tbx.text
import tbx.code
import logging
import arrow
import traceback
from bson.code import Code
from collections import defaultdict
from datetime import datetime, timedelta


# Flask
app = Flask(__name__, static_folder='static', static_url_path='/static', template_folder='templates')
app.secret_key = "jobmanager-api-secret-key-01"
app.jinja_env.lstrip_blocks = True
app.jinja_env.trim_blocks = True

APP_NAME = "Job Manager"


def serialize_response(result):
    mimetype = request.accept_mimetypes.best_match(tbx.text.mime_rendering_dict.keys(), default='application/json')
    if request.args.get('format') and request.args.get('format') in tbx.text.mime_shortcuts.keys():
        mimetype = tbx.text.mime_shortcuts.get(request.args.get('format'))
    code = 200

    if isinstance(result, common.BaseDocument):
        result = result.to_safe_dict()
    if isinstance(result, common.SerializableQuerySet):
        result = result.to_safe_dict()
    assert isinstance(result, dict) or isinstance(result, list)

    result = common.change_keys(result, common.replace_cls_type)
    return Response(tbx.text.render_dict_from_mimetype(result, mimetype), status=code, mimetype=mimetype)


#decorator
def serialize(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        result = func(*args, **kwargs)
        return serialize_response(result)

    return wrapper


def plain_text(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        result = func(*args, **kwargs)
        return Response(result, status=200, mimetype='text/plain')
    return wrapper


def register_api(view, endpoint, url, pk='uuid', pk_type='string(length=11)'):
    view_func = view.as_view(endpoint)
    app.add_url_rule(url, defaults={pk: None}, view_func=view_func, methods=['GET',])
    app.add_url_rule(url, view_func=view_func, methods=['POST',])
    app.add_url_rule('%s<%s:%s>' % (url, pk_type, pk), view_func=view_func, methods=['GET', 'PUT', 'DELETE'])


def import_from_name(module_name):
    globals()[module_name] = __import__(module_name)


def find_job_type(job_type, module=None):
    cls = None
    try:
        cls = mongoengine.base.common.get_document(job_type)
    except mongoengine.errors.NotRegistered:
        pass

    additionnal_error_info = ""
    if not cls and module:
        try:
            import_from_name(module)
        except ImportError:
            additionnal_error_info = " and module '%s' could not be imported" % module

        try:
            cls = mongoengine.base.common.get_document(job_type)
        except mongoengine.errors.NotRegistered:
            pass

    if not cls:
        raise Exception("Job type '%s' is unknown %s." % (job_type, additionnal_error_info))

    return cls


###
# API Definition
###
class JobAPI(MethodView):
    decorators = [serialize]

    def get(self, uuid=None):
        if uuid:
            return Job.objects.get(uuid=uuid)
        else:
            lim = int(request.args.get('limit', 10))
            off = int(request.args.get('offset', 0))
            job_type = request.args.get('type', None)
            host = request.args.get('host', None)
            filters = {}
            if job_type:
                filters['_cls'] = job_type
            if host:
                filters['host'] = host
            return Job.objects(**filters).order_by('-created')[off:lim]

    @classmethod
    def live(cls, uuid=''):
        args = dict(request.args.items())
        args['job_uuid'] = ''
        if uuid:
            job = Job.objects.get(uuid=uuid)
            if not job:
                raise Exception("Job %s not found" % uuid)
            args['job_uuid'] = job.uuid
        return render_template('job/live.html',
                               app_name=APP_NAME,
                               title=APP_NAME+" - %s Job view" % (uuid),
                               **args)

    @classmethod
    @serialize
    def doc(cls, job_class_name=''):
        if job_class_name:
            job_class = find_job_type(job_class_name)
            if not job_class:
                raise Exception("Job %s not found" % job_class_name)
            return job_class.get_doc()
        else:
            return {j.__name__: j.__doc__.strip() for j in tbx.code.get_subclasses(Job)}

    def post(self):
        data = request.data.decode('UTF-8')
        data = json.loads(data)
        job_type = data.pop('type', None)
        module = data.pop('module', None)
        if not job_type:
            raise Exception("Job has no 'type' field or is not set (value='%s')." % type)
        cls = find_job_type(job_type, module=module)

        new_data = common.change_keys(data, replace_type_cls)
        new_job = cls.from_json(tbx.text.render_json(new_data))
        new_job.save()
        logging.info("New Job created")
        logging.info(str(new_job))
        return new_job

    def delete(self, uuid):
        # delete a single job
        raise NotImplementedError()

    def put(self, uuid):
        job = Job.objects.get(uuid=uuid)
        data = request.data.decode('UTF-8')
        data = json.loads(data)
        job.update(**data)
        job.reload()
        logging.info("Updated Job %s" % uuid)
        logging.info(str(job))
        job.save()
        return job


###
# API Definition
###
class HostAPI(MethodView):
    decorators = [serialize]

    def get(self, hostname=None):
        lim = int(request.args.get('limit', 10))
        off = int(request.args.get('offset', 0))
        step = int(request.args.get('step', 0))
        if hostname:
            host = Host.objects.get(hostname=hostname)
            if not host:
                raise Exception("Host %s not found." % hostname)
            return host.to_safe_dict(alive=True, with_history=True, limit=lim, offset=off, step=step)
        else:
            if 'alive' in request.args:
                alive = int(request.args.get('alive', 1))
                alive_hosts = HostStatus.objects(created__gte=datetime.utcnow() - timedelta(minutes=alive)).aggregate({"$group": { "_id": "$host.hostname" }})
                alive_hostnames = [cs['_id'] for cs in alive_hosts]
                return Host.objects(hostname__in=alive_hostnames).order_by('-created')[off:lim].to_safe_dict()
            else:
                return Host.objects.order_by('-created')[off:lim].to_safe_dict()

    def put(self, hostname):
        host = Host.objects.get(hostname=hostname)
        data = request.data.decode('UTF-8')
        data = json.loads(data)
        host.update(**data)
        host.reload()
        logging.info("Updated Host %s" % hostname)
        logging.info(str(host))
        host.save()
        return host

    @classmethod
    @serialize
    def stats(cls, hostname):
        lim = int(request.args.get('limit', 50))
        db = mongoengine.connection.get_db()
        hosts = Host.objects(hostname=hostname)
        if not hosts:
            raise Exception("No host found with hostname %s" % hostname)
        host = hosts[0]
        job_count = Job.objects(hostname=hostname).count()
        jobs = [
            {'uuid': j.uuid, 'status': j.status, 'completion': j.completion, 'type': j._cls.replace('Job.', ''), 'created': j.created}
            for j in Job.objects(hostname=hostname).order_by('-created')[0:lim]
        ]
        t = Job.objects(hostname=hostname).explain()
        job_statuses_pipeline = [
                #{'$match': {'host.hostname': hostname}},
                {'$match': {'hostname': hostname}},
                {'$limit': lim},
                {'$sort': {"created": -1}},
                {'$group': {
                    '_id': "$status",
                    'jobs': {"$push": "$uuid"},
                    'last': {"$first": "$created"},
                    'count': {'$sum': 1}
                }},
                {'$project': {
                    '_id': 0,
                    'jobs': '$jobs',
                    'last': '$last',
                    'status': '$_id',
                    'count': '$count'
                }}
            ]

        job_statuses = db.command('aggregate', "jobs", pipeline=job_statuses_pipeline).get('result')

        return {
            'hostname': hostname,
            'count': job_count,
            'statuses': list(job_statuses),
            'jobs': jobs,
            'limit': lim
        }

    @classmethod
    def live(cls):
        args = dict(request.args.items())
        return render_template('host/live.html', app_name=APP_NAME, title=APP_NAME + " - Hosts - Live view", **args)


    @classmethod
    def live2(cls):
        args = dict(request.args.items())
        return render_template('host/live2.html', app_name=APP_NAME, title=APP_NAME + " - Hosts - Live view", **args)


###
# API Definition
###
"""
class HostAPI(object):

    @serialize
    def get(self, hostname=None):
        lim = int(request.args.get('limit', 10))
        off = int(request.args.get('offset', 0))
        if hostname:
            host = Host.objects.get(hostname=hostname)
            if not host:
                raise Exception("Host %s not found." % hostname)
            return host.to_safe_dict()
        else:
            return Host.objects.order_by('-created')[off:lim].to_safe_dict()
"""


###
# API Definition
###
class JobLogAPI(object):

    def __init__(self):
        self.db = mongoengine.connection.get_db()

    def get_logs(self, filters=None):
        limit = int(request.args.get('limit', 1000))
        since = request.args.get('since', None)
        level = request.args.get('level', None)
        if not filters:
            filters = {
                'hostname': request.args.get('hostname', None),
                'log_name': request.args.get('log_name', None),
                'job_type': request.args.get('job_type', None),
                'job_uuid': request.args.get('job_uuid', None),
                'level': request.args.get('level', None)
            }
            filters = {k: v for k, v in filters.items() if v}
        if since:
            since = arrow.get(since).datetime
            filters["timestamp"] = {"$gte": since}
        levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
        if level and (level in levels):
            allowed_levels = levels[levels.index(level):]
            filters['level'] = {'$in': allowed_levels}
        return self.db.job_logs.find(filters, {'_id': 0}).sort([('timestamp', -1)]).limit(limit)

    @serialize
    def get(self):
        return list(self.get_logs())

    @plain_text
    def flat(self):
        line_format = "%(timestamp)s - %(hostname)s - %(level)s\t| %(message)s"
        return "\n".join([line_format % defaultdict(str, f) for f in reversed(list(self.get_logs())) if f['message']])

    def live(self):
        args = dict(request.args.items())
        return render_template('log/live.html', app_name=APP_NAME, title=APP_NAME + " - Logs Live view", **args)

    @serialize
    def list_distinct(self, field=None):
        if field is None:
            return list(self.db.job_logs.map_reduce(
                Code("""function() { for (var key in this) { emit(key, null); } }"""),
                Code("""function(key, stuff) { return null; }"""),
                "job_log_keys",
                limit=10000,
            ).distinct('_id'))

        limit = int(request.args.get('limit', 100))
        record_limit = int(request.args.get('record_limit', 100000))
        return list(self.db.job_logs.aggregate(
        [
            {'$match': {field: {"$ne": None}}},
            {'$sort': {field: 1, 'timestamp': 1}},
            {'$limit': record_limit}, #to avoid scanning the entire database
            {
                '$group': {
                    '_id': "$"+field,
                    'last_log': {'$last': "$timestamp"}
                }
            },
            {'$limit': limit},
            {'$sort': {'last_log': -1}},
            {'$project': {
                '_id': 0,
                field: '$_id',
                'last_log': 1
            }}
        ]))


#from flask_mongoengine.wtf import model_form
#PostJobForm = model_form(Job, field_args={'created' : False, 'host' : False})


def index():
    #data =  {}
    #if request.data:
    #    data = json.loads(request.data.decode('UTF-8'))
    #form = PostJobForm(data)
    return render_template('index.html', app_name=APP_NAME, title=APP_NAME + " - Home")

###
# Error handling
###
# @app.errorhandler(Exception)
# def unknown_error(e):
#     logging.exception("Exception occured - " + str(e))
#     mimetype = request.accept_mimetypes.best_match(tbx.text.mime_rendering_dict.keys(), default='application/json')
#     result = {
#         'status': 'ERROR',
#         'code': 500,
#         'type': e.__class__.__name__,
#         'message': str(e),
#         'url': request.path,
#         'data': request.data.decode('UTF-8'),
#         'values': request.values
#     }
#     return Response(tbx.text.render_dict_from_mimetype(result, mimetype), status=500, mimetype=mimetype)


@app.errorhandler(404)
def page_not_found(e):
    mimetype = request.accept_mimetypes.best_match(tbx.text.mime_rendering_dict.keys(), default='application/json')
    result = {
        'status': 'ERROR',
        'code': 404,
        'type': '404 Not Found',
        'message': 'Url is unknown',
        'url': request.path,
        'data': request.data.decode('UTF-8'),
        'values': request.values
    }
    return Response(tbx.text.render_dict_from_mimetype(result, mimetype), status=404, mimetype=mimetype)


###
# Run
###
def run_api(host='0.0.0.0', port=5000, debug=False):
    import jobmanager.common.example
    register_api(JobAPI, 'job_api', '/job/', pk='uuid')
    app.add_url_rule('/job/live/', endpoint='job_view', view_func=JobAPI.live, methods=['GET'])
    app.add_url_rule('/job/doc/', endpoint='job_doc', view_func=JobAPI.doc, methods=['GET'])
    app.add_url_rule('/job/live/<string(length=11):uuid>', endpoint='job_view', view_func=JobAPI.live, methods=['GET'])
    app.add_url_rule('/job/doc/<string:job_class_name>', endpoint='job_doc', view_func=JobAPI.doc, methods=['GET'])

    #host_api = HostAPI()
    #app.add_url_rule('/host/', endpoint='list_host', view_func=host_api.get, methods=['GET'])
    #app.add_url_rule('/host/<string:hostname>', endpoint='get_host', view_func=host_api.get, methods=['GET'])
    #app.add_url_rule('/host/<string:hostname>', endpoint='update_host', view_func=host_api.put, methods=['PUT'])

    register_api(HostAPI, 'host_api', '/host/', pk='hostname', pk_type='string')
    app.add_url_rule('/host/live/', endpoint='host_live', view_func=HostAPI.live, methods=['GET'])
    app.add_url_rule('/host/live2/', endpoint='host_live2', view_func=HostAPI.live2, methods=['GET'])
    app.add_url_rule('/host/stats/<string:hostname>', endpoint='host_stats', view_func=HostAPI.stats,
                     methods=['GET'])

    #register_api(HostAPI, 'client_api', '/client/', pk='uuid')
    #app.add_url_rule('/client/live/', endpoint='client_live', view_func=ClientAPI.live, methods=['GET'])
    #app.add_url_rule('/client/stats/<string(length=11):uuid>', endpoint='client_stats', view_func=ClientAPI.stats, methods=['GET'])

    job_log = JobLogAPI()
    #view_func = JobLogAPI.as_view('log_api')
    app.add_url_rule('/logs/', view_func=job_log.get, methods=['GET'])
    app.add_url_rule('/logs/flat/', view_func=job_log.flat, methods=['GET'])
    app.add_url_rule('/logs/live/', view_func=job_log.live, methods=['GET'])
    app.add_url_rule('/logs/distinct/', view_func=job_log.list_distinct, methods=['GET'])
    app.add_url_rule('/logs/distinct/<string:field>', view_func=job_log.list_distinct, methods=['GET'])

    app.add_url_rule('/favicon.ico', endpoint='favicon', redirect_to='/static/favicon.ico')
    app.add_url_rule('/', endpoint='index', view_func=index, methods=['GET', 'POST'])

    app.config['WTF_CSRF_ENABLED'] = False
    app.run(host=host, port=port, debug=debug)
    logging.info('Flask App exited gracefully, exiting...')

