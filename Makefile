.PHONY: data test clean

data:
	python -m data.synthetic.products
	python -m data.synthetic.manufacturers
	python -m data.synthetic.boms
	python -m data.synthetic.suppliers
	python -m data.synthetic.customers
	python -m data.synthetic.plants
	python -m data.synthetic.lanes
	python -m data.synthetic.incidents
	python -m data.synthetic.telemetry
	python -m data.synthetic.maintenance
	python -m data.synthetic.esg

test:
	pytest -v

clean:
	rm -rf data/output/*.ndjson .pytest_cache __pycache__ */**/__pycache__
