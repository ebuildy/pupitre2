package checker.lab

import rego.v1

default allow := false

allow if count(violations) == 0

violations contains "Ouvrez une merge request vers la branche par défaut" if count(input.openMrs) == 0

violations contains "Le pipeline de la merge request doit réussir" if {
	count(input.openMrs) > 0
	not pipeline_passed
}

pipeline_passed if {
	some mr in input.openMrs
	mr.pipelineStatus == "success"
}

violations contains "lab.py doit définir une fonction main()" if {
	not contains(object.get(input.files, "lab.py", ""), "def main(")
}
