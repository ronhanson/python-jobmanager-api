#!/usr/bin/env python
# -*- coding: utf-8 -*-
# vim: ai ts=4 sts=4 et sw=4 nu
"""
(c) 2015 Ronan Delacroix
Python Job Manager Server API
:author: Ronan Delacroix
"""
from flask import Flask, request, Response, render_template
from functools import wraps
import json
from flask.views import MethodView
import mongoengine.base.common
import mongoengine.errors
import mongoengine.connection
from jobmanager.common.job import SerializableQuerySet, BaseDocument, Job, Client, ClientStatus
import tbx
import tbx.text
import logging
import arrow
import traceback
from bson.code import Code
from collections import defaultdict
from datetime import datetime, timedelta


# Flask
app = Flask(__name__, static_folder='static', static_url_path='/static', template_folder='templates')


def serialize_response(result):
    mimetype = request.accept_mimetypes.best_match(tbx.text.mime_rendering_dict.keys(), default='application/json')
    code = 200

    if isinstance(result, BaseDocument):
        result = result.to_safe_dict()
    if isinstance(result, SerializableQuerySet):
        result = result.to_safe_dict()
    assert isinstance(result, dict) or isinstance(result, list)

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
            client = request.args.get('client', None)
            filters = {}
            if job_type:
                filters['_cls'] = job_type
            if client:
                filters['client_uuid'] = client
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
        return render_template('job/live.html', title="Job Manager - %s Job view" % (uuid), **args)

    def post(self):
        data = request.data.decode('UTF-8')
        data = json.loads(data)
        job_type = data.pop('type', None)
        module = data.pop('module', None)
        if not job_type:
            raise Exception("Job has no 'type' field or is not set (value='%s')." % type)
        cls = find_job_type(job_type, module=module)

        new_job = cls.from_json(tbx.text.render_json(data))
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
class ClientAPI(MethodView):
    decorators = [serialize]

    def get(self, uuid=None):
        lim = int(request.args.get('limit', 10))
        off = int(request.args.get('offset', 0))
        step = int(request.args.get('step', 0))
        if uuid:
            client = Client.objects.get(uuid=uuid)
            if not client:
                raise Exception("Client %s not found." % uuid)
            return client.to_safe_dict(alive=True, with_history=True, limit=lim, offset=off, step=step)
        else:
            if 'alive' in request.args:
                alive_clients = ClientStatus.objects(created__gte=datetime.utcnow() - timedelta(minutes=1)).aggregate({"$group": { "_id": "$client.uuid" }})
                alive_client_uuids = [cs['_id'] for cs in alive_clients]
                return Client.objects(uuid__in=alive_client_uuids).order_by('-created')[off:lim].to_safe_dict()
            else:
                return Client.objects.order_by('-created')[off:lim].to_safe_dict()

    @classmethod
    @serialize
    def stats(cls, uuid):
        lim = int(request.args.get('limit', 50))
        db = mongoengine.connection.get_db()
        job_count = Job.objects(client_uuid=uuid).count()
        jobs = [
            {'uuid': j.uuid, 'status': j.status, 'completion': j.completion, 'type': j._cls.replace('Job.', ''), 'created': j.created}
            for j in Job.objects(client_uuid=uuid).order_by('-created')[0:lim]
        ]
        job_statuses = db.jobs.aggregate(
            [
                {'$match': {'client_uuid': uuid}},
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
        ).get('result')

        return {
            'client_uuid': uuid,
            'count': job_count,
            'statuses': job_statuses,
            'jobs': jobs,
            'limit': lim
        }

    @classmethod
    def live(cls):
        args = dict(request.args.items())
        return render_template('client/live.html', title="Job Manager Clients - Live view", **args)


###
# API Definition
###
class JobLogAPI(object):

    def __init__(self):
        self.db = mongoengine.connection.get_db()

    def get_logs(self, filters=None):
        limit = int(request.args.get('limit', 1000))
        since = request.args.get('since', None)
        if not filters:
            filters = {
                'hostname': request.args.get('hostname', None),
                'log_name': request.args.get('log_name', None),
                'application': request.args.get('application', None),
                'job_type': request.args.get('job_type', None),
                'job_uuid': request.args.get('job_uuid', None),
                'client_uuid': request.args.get('client_uuid', None),
                'client_hostname': request.args.get('client_hostname', None),
            }
            filters = {k: v for k, v in filters.items() if v}
        if since:
            since = arrow.get(since).datetime
            filters["timestamp"] = {"$gte": since}
        return self.db.job_logs.find(filters).sort([('timestamp', -1)]).limit(limit)

    @serialize
    def get(self):
        return list(self.get_logs())

    @plain_text
    def flat(self):
        line_format = "%(timestamp)s - %(hostname)s - %(level)s\t| %(message)s"
        return "\n".join([line_format % defaultdict(str, f) for f in reversed(list(self.get_logs())) if f['message']])

    def live(self):
        args = dict(request.args.items())
        return render_template('log/live.html', title="Job Manager Logs - Live view", **args)

    @serialize
    def list_distinct(self, field=None):
        if field is None:
            return list(self.db.job_logs.map_reduce(
                Code("""function() { for (var key in this) { emit(key, null); } }"""),
                Code("""function(key, stuff) { return null; }"""),
                "job_log_keys"
            ).distinct('_id'))

        limit = int(request.args.get('limit', 100))
        record_limit = int(request.args.get('record_limit', 100000))
        return self.db.job_logs.aggregate(
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
        ]).get('result')


###
# Error handling
###
@app.errorhandler(Exception)
def unknown_error(e):
    logging.exception("Exception occured - " + str(e))
    mimetype = request.accept_mimetypes.best_match(tbx.text.mime_rendering_dict.keys(), default='application/json')
    result = {
        'status': 'ERROR',
        'code': 500,
        'type': e.__class__.__name__,
        'message': str(e),
        'url': request.path,
        'data': request.data.decode('UTF-8'),
        'values': request.values
    }
    return Response(tbx.text.render_dict_from_mimetype(result, mimetype), status=500, mimetype=mimetype)


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
    register_api(JobAPI, 'job_api', '/job/', pk='uuid')
    app.add_url_rule('/job/live/', endpoint='job_view', view_func=JobAPI.live, methods=['GET'])
    app.add_url_rule('/job/live/<string(length=11):uuid>', endpoint='job_view', view_func=JobAPI.live, methods=['GET'])

    register_api(ClientAPI, 'client_api', '/client/', pk='uuid')
    app.add_url_rule('/client/live/', endpoint='client_live', view_func=ClientAPI.live, methods=['GET'])
    app.add_url_rule('/client/stats/<string(length=11):uuid>', endpoint='client_stats', view_func=ClientAPI.stats, methods=['GET'])

    job_log = JobLogAPI()
    #view_func = JobLogAPI.as_view('log_api')
    app.add_url_rule('/logs/', view_func=job_log.get, methods=['GET'])
    app.add_url_rule('/logs/flat/', view_func=job_log.flat, methods=['GET'])
    app.add_url_rule('/logs/live/', view_func=job_log.live, methods=['GET'])
    app.add_url_rule('/logs/distinct/', view_func=job_log.list_distinct, methods=['GET'])
    app.add_url_rule('/logs/distinct/<string:field>', view_func=job_log.list_distinct, methods=['GET'])

    app.run(host=host, port=port, debug=debug)
    logging.info('Flask App exited gracefully, exiting...')

