#!/usr/bin/env python
# -*- coding: utf-8 -*-
# vim: ai ts=4 sts=4 et sw=4 nu
"""
(c) 2017 Ronan Delacroix
Job Manager sub module
:author: Ronan Delacroix
"""
import pkgutil
__path__ = pkgutil.extend_path(__path__, __name__)


# Default values (overriden)
DATABASE_HOST = 'localhost'
DATABASE_PORT = 27017
DATABASE_NAME = 'jobmanager'

LOG_FILE = None

WEB_HOST = '0.0.0.0'
WEB_PORT = 5000
WEB_DEBUG = False