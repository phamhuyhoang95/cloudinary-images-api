angular.module('app', ['angularFileUpload'])

  // The example of the full functionality
  .controller('TestController', function ($scope, FileUploader, $http) {
    'use strict';

    // create a uploader with options
    $http.get('/categories?per_page=1000').then(resp => {
      $scope.listContainer = resp.data.data.map(d => d.category_name)
      // init container to upload
      $scope.current_container = _.first($scope.listContainer)
    })
    $scope.change_container = (container_name) => {
      $scope.current_container = container_name
    }

    var uploader = $scope.uploader = new FileUploader({
      scope: $scope, // to automatically update the html. Default: $rootScope
      url: '',
      formData: [],
      body: {
        "name": "imageloopback"
      },
      params: {
        orderId: 1,
        customerId: 1
      }
    });
    // trigger upload all event
    $scope.uploadAll = () => {
      swal({
        title: "Upload progess is actived ! please wait :D",
        icon: "warning"
      })
      // call uploadAll func
      $scope.uploader.uploadAll()
    }

    // ADDING FILTERS
    uploader.filters.push({
      name: 'filterName',
      fn: function (item, options) { // second user filter
        console.info('filter2');
        return true;
      }
    });

    // REGISTER HANDLERS
    uploader.onBeforeUploadItem = function (item) {
      console.info('Before upload', item);
      item.url = `/images`;
      item.formData = [{
        tags: $scope.tags || "",
        category_name: $scope.current_container
      }]
    };
    // --------------------
    uploader.onAfterAddingFile = function (item) {
      console.info('After adding a file', item);
    };
    // --------------------
    uploader.onAfterAddingAll = function (items) {
      console.info('After adding all files', items);
    };
    // --------------------
    uploader.onWhenAddingFileFailed = function (item, filter, options) {
      console.info('When adding a file failed', item);
    };

    // --------------------
    uploader.onProgressItem = function (item, progress) {
      console.info('Progress: ' + progress, item);
    };
    // --------------------
    uploader.onProgressAll = function (progress) {
      console.info('Total progress: ' + progress);
    };
    // --------------------
    uploader.onSuccessItem = function (item, response, status, headers) {
      console.info('Success', response, status, headers);
      $scope.$broadcast('uploadCompleted', item);
    };
    // --------------------
    uploader.onErrorItem = function (item, response, status, headers) {
      console.info('Error', response, status, headers);
    };
    // --------------------
    uploader.onCancelItem = function (item, response, status, headers) {
      console.info('Cancel', response, status);
    };
    // --------------------
    uploader.onCompleteItem = function (item, response, status, headers) {
      console.info('Complete', response, status, headers);
    };
    // --------------------
    uploader.onCompleteAll = function () {
      console.info('Complete all');
      $scope.$broadcast('onCompleteAll', 'done')
    };
    // --------------------
  }).controller('FilesController', function ($scope, $http) {
    $scope.totalSizeImage = 0

    $scope.edit = (img) => {
      //open modal by jquery
      $scope.selectedImg = img
      $('#myModal').modal('toggle')
    }
    $scope.showImages = (container) => {
      $scope.isShow = container ? true : false
      $scope.currentShowContainerName = container.container_name
      $scope.currentShowImages = container.files
      $scope.currentFeatureImages = container.files.filter(img => img.isFeatureImage === true)
    }
    $scope.saveChange = () => {
      let {
        category_name,
        tags,
        isFeatureImage,
        public_id
      } = $scope.selectedImg
      if (tags instanceof Array) {
        tags = tags.toString()
      }
      swal({
          title: "Are you sure update this image?",
          text: "Update can be done immediately!",
          icon: "warning",
          buttons: true,
          dangerMode: true,
        })
        .then((willUpdate) => {
          if (willUpdate) {
            $http({
              method: 'PUT',
              data: JSON.stringify({
                public_id,
                category_name,
                tags,
                isFeatureImage
              }),
              url: '/image',
              headers: {
                'Content-Type': 'application/json;charset=utf-8'
              }
            }).success(function (data, status, headers) {
              swal("Poof! Your image has been updated!", {
                icon: "success",
              });
              $('#myModal').modal('toggle')
              swal.close()
              // reload 
              $scope.load()
            });
          } else {
            swal("Your image is safe!");
          }
        });
    }

    $scope.load = function () {
      let listContainer
      // get list of containers
      $http.get('/categories?per_page=1000').then(resp => {
        listContainer = resp.data.data.map(d => d.category_name)
        // get all files for each container 
        return Promise.all(listContainer.map(container_name => $http.get(`/category?category_name=${container_name}&per_page=10000`)))
      }).then(resp => {
        const file_inside_container = resp.map(f => f.data.data)
        $scope.container_data = listContainer.map((container_name, idx) => {

          return {
            container_name,
            files: file_inside_container[idx].map(img => {
              $scope.totalSizeImage += img.bytes
              return img
            })
          }
        })
        // match container with file 
      })
    };

    $scope.delete = function (index, public_id) {
      // swal({
      //     title: "Are you sure delete this image?",
      //     text: "Once deleted, you will not be able to recover  it!",
      //     icon: "warning",
      //     buttons: true,
      //     dangerMode: true,
      //   })
      //   .then((willDelete) => {
      //     if (willDelete) {
      $http({
        method: 'DELETE',
        data: JSON.stringify({
          public_id
        }),
        url: '/image',
        headers: {
          'Content-Type': 'application/json;charset=utf-8'
        }
      }).success(function (data, status, headers) {
        // find file location to delete
        if (status == 200) {
          $scope.currentShowImages.splice(index, 1)
          // swal("Poof! Your image has been deleted!", {
          //   icon: "success",
          // });
        } else {
          swal("Backend Error")
        }
      });
      //   } else {
      //     swal("Your image is safe!");
      //   }
      // });

    };
    // push notification to user
    $scope.pushNotification = () => {
      swal({
          title: "Send notification now?",
          text: "Once notification send , you will not be able to rollback!",
          icon: "warning",
          buttons: true,
          dangerMode: true,
        })
        .then((willSend) => {
          if (willSend) {
            $http({
              method: 'POST',
              data: JSON.stringify($scope.notification),
              url: '/notification',
              headers: {
                'Content-Type': 'application/json;charset=utf-8'
              }
            }).success((data, status, headers) => {
              if (status == 200) {
                swal("Poof! Your notification has been send!", {
                  icon: "success",
                });
                $('#notificationModal').modal('toggle')
                $scope.notification = {}

              }
            })
          } else {
            swal("Notification Cancelled!");
          }
        });
    }
    $scope.$on('uploadCompleted', function (event) {
      console.log('uploadCompleted event received');
    });
    $scope.$on('onCompleteAll', function (event) {
      console.log("done all upload queue")
      swal.close()
      // show success alert
      swal({
        title: "Your file already uploaded! :D",
        icon: "success"
      })
      // $scope.load()
      location.reload();
    })
    // show image size 
    $scope.imageSize = (size, unit) => {
      let factor = 1024
      switch (unit) {
        case 'kb':
          break;
        case 'mb':
        factor = Math.pow(factor, 2)
          break;
        case 'gb':
        factor = Math.pow(factor, 3)
          break
        default:
          break;
      }
      return Math.round(size / factor).toString().concat(` ${unit}`)
    }

  });