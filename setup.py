from setuptools import setup, find_packages
import os
import re

if os.environ.get('USER', '') == 'vagrant':
    del os.link

requirements = [r.strip() for r in open('requirements.txt').readlines() if not r.startswith('--')]
requirements = [r if ('git+' not in r) else re.sub(r".*egg=(.*)", r"\1", r).strip() for r in requirements]

setup(
    name='jobmanager-api',
    version=open('VERSION.txt').read().strip(),
    author='Ronan Delacroix',
    author_email='ronan.delacroix@gmail.com',
    url='https://github.com/ronhanson/python-jobmanager-api',
    packages=find_packages(where='.', exclude=["fabfile", "tools", "*.tests", "*.tests.*", "tests.*", "tests"]) + ['jobmanager'],
    include_package_data=True,
    package_data={}, #done in MANIFEST.in
    scripts=['bin/jobmanager-api'],
    data_files=[
        ('/etc/jobmanager', ['bin/api.ini', 'bin/api.spec']),
        ('/var/log/jobmanager', [])
    ],
    license=open('LICENCE.txt').read().strip(),
    description='Job Manager API',
    long_description=open('README.md').read().strip(),
    setup_requires=requirements,
    classifiers=[
        'Topic :: Utilities',
        'Topic :: Software Development :: Libraries',
        'Development Status :: 4 - Beta',
        'Intended Audience :: Developers',
        'Intended Audience :: Manufacturing',
        'Intended Audience :: System Administrators',
        'License :: OSI Approved :: MIT License',
        'Operating System :: MacOS :: MacOS X',
        'Operating System :: POSIX',
        'Operating System :: Microsoft :: Windows',
        'Programming Language :: Python :: 2.7',
        'Programming Language :: Python :: 3.4',
    ],
)
