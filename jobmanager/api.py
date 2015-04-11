#!/usr/bin/env python
# -*- coding: utf-8 -*-
# vim: ai ts=4 sts=4 et sw=4 nu
"""
(c) 2015 Ronan Delacroix
Python Job Manager Server API
:author: Ronan Delacroix
"""
from flask import Flask, request, Response
from functools import wraps
import json
from flask.views import MethodView
import mongoengine.base.common
import mongoengine.errors
from jobmanager.common.job import Job
import tbx
import tbx.text


# Flask
app = Flask(__name__)


def serialize(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        mimetype = request.accept_mimetypes.best_match(tbx.text.mime_rendering_dict.keys(), default='application/json')
        result = {}
        code = 200
        try:
            result = func(*args, **kwargs).to_safe_dict()
        except Exception as e:
            code = 500
            result = {
                'status': 'ERROR',
                'code': code,
                'type': e.__class__.__name__,
                'message': str(e),
                'url': request.path,
                'data': request.data.decode('UTF-8'),
                'values': request.values
            }

        return Response(tbx.text.render_dict_from_mimetype(result, mimetype), status=code, mimetype=mimetype)
    return wrapper


def register_api(view, endpoint, url, pk='uuid', pk_type='string(length=11)'):
    view_func = view.as_view(endpoint)
    app.add_url_rule(url, defaults={pk: None}, view_func=view_func, methods=['GET',])
    app.add_url_rule(url, view_func=view_func, methods=['POST',])
    app.add_url_rule('%s<%s:%s>' % (url, pk_type, pk), view_func=view_func, methods=['GET', 'PUT', 'DELETE'])


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
            return Job.objects[off:lim]

    def post(self):
        data = request.data.decode('UTF-8')
        data = json.loads(data)
        type = data.pop('type', None)
        if not type:
            raise Exception("Job has no 'type' field or is not set (value='%s')." % type)
        try:
            cls = mongoengine.base.common.get_document(type)
        except mongoengine.errors.NotRegistered as e:
            raise Exception("Job type '%s' is unknown." % type)
        new_job = cls.from_json(tbx.text.render_json(data))
        new_job.save()
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
        job.save()
        return job



###
# Error handling
###

@app.errorhandler(Exception)
def unknown_error(e):
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

def run_api():
    register_api(JobAPI, 'job_api', '/job/', pk='uuid')

    app.run(host='0.0.0.0', port=5000, debug=True)